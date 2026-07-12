/**
 * Seed 3 demo profiles with realistic saves and AI-generated decisions.
 *
 * Run:
 *   cd artifacts/api-server && \
 *   node_modules/.bin/esbuild src/scripts/seed-demo.ts --bundle --platform=node --format=cjs \
 *     --outfile=/tmp/seed-demo.cjs && node /tmp/seed-demo.cjs
 */

import { db, savesTable, decisionsTable } from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { verdictJsonSchema } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const DEMO_USER_IDS = ["demo_elena", "demo_james", "demo_nina"];

// ── Shared AI prompts (same as production) ────────────────────────────────────

const SHARED_JSON_SCHEMA = `{
  "type": "choose" | "structure",
  "verdict": "...",
  "travelPatterns": ["pattern 1", "pattern 2", "pattern 3"],
  "coreConflict": "...",
  "whatYoureMissing": "...",
  "whyThisFits": "...",
  "tradeoffs": "...",
  "avoidIf": ["condition 1", "condition 2"],
  "nextMove": "...",
  "anchors": ["anchor 1", "anchor 2", "anchor 3"],
  "timingConfidence": "...",
  "stopDoingThis": "...",
  "usedSaveIds": [1, 2, 3]
}`;

const CHOOSE_SYSTEM_PROMPT = `You are a travel decision engine. The user is choosing between specific destinations or options. Pick exactly one and be direct about why the other(s) lose.

You MUST return ONLY valid JSON — no prose, no markdown, no backticks, no wrapper text. Just the raw JSON object.

The JSON must have exactly these fields:

${SHARED_JSON_SCHEMA}

RULES FOR CHOOSE VERDICTS:
- "type" must be "choose".
- "verdict": Name the winning destination or option only — e.g. "Patagonia in March" or "Sicily over Tokyo".
- "whyThisFits": Explain exactly why this option wins for this user's pattern. Be specific to their saves.
- "tradeoffs": MUST name the losing option explicitly. Format: "Why not [losing option]: ..." followed by what you give up. This is not generic — it directly addresses the alternative.
- "anchors": 3 areas or districts within the chosen destination to base yourself.
- "avoidIf": Conditions under which the chosen option fails.
- Be decisive. Do not hedge. Do not suggest both are great.
- travelPatterns must have exactly 3 items.
- anchors must have exactly 3 items.
- usedSaveIds must list the IDs of saves you actually used.
- Do not use emojis.
- Return ONLY the JSON object, nothing else.`;

const STRUCTURE_SYSTEM_PROMPT = `You are a travel decision engine. The user wants to structure a trip — they have a destination (or cluster of places) and need an order of operations: which place first, how many days, why that sequence.

You MUST return ONLY valid JSON — no prose, no markdown, no backticks, no wrapper text. Just the raw JSON object.

The JSON must have exactly these fields:

${SHARED_JSON_SCHEMA}

RULES FOR STRUCTURE VERDICTS:
- "type" must be "structure".
- "verdict": Name the trip structure as a sequence — e.g. "Tokyo → Hakone → Kyoto" or "3 days Lisbon, 4 days Alentejo, 2 days Porto". This is the headline order of operations.
- "whyThisFits": Explain the sequence logic — why this order, why these day counts, how it flows with the user's travel style from their saves.
- "tradeoffs": Address what breaks if they deviate from this order. Be specific.
- "anchors": The 3 key zones, clusters, or bases within the structured itinerary.
- "avoidIf": Conditions that would break this trip structure.
- "nextMove": One concrete booking or planning action that locks in the sequence.
- Be decisive about the sequence. Do not offer alternatives.
- travelPatterns must have exactly 3 items.
- anchors must have exactly 3 items.
- usedSaveIds must list the IDs of saves you actually used.
- Do not use emojis.
- Return ONLY the JSON object, nothing else.`;

async function classifyQuestion(question: string): Promise<"choose" | "structure"> {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      max_completion_tokens: 64,
      messages: [
        {
          role: "system",
          content: `Classify the travel question as either "choose" or "structure".
- "choose": The user is deciding between two or more specific destinations or options.
- "structure": The user wants to plan the sequence, pacing, or itinerary of a trip.

Return ONLY a JSON object: { "type": "choose" } or { "type": "structure" }. No other text.`,
        },
        { role: "user", content: question },
      ],
      response_format: { type: "json_object" },
    });
    const raw = response.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    if (parsed.type === "choose" || parsed.type === "structure") return parsed.type;
  } catch { /* fall through */ }
  return "choose";
}

async function generateDecision(question: string, saves: typeof savesTable.$inferSelect[]) {
  const savesSnapshot = saves.map(s => {
    const parts = [`ID:${s.id}`, s.content];
    if (s.scrapedTitle) parts.push(`Title: ${s.scrapedTitle}`);
    if (s.scrapedDescription) parts.push(`Description: ${s.scrapedDescription}`);
    return parts.join("\n");
  }).join("\n\n---\n\n");

  const questionType = await classifyQuestion(question);
  const systemPrompt = questionType === "structure" ? STRUCTURE_SYSTEM_PROMPT : CHOOSE_SYSTEM_PROMPT;
  const userPrompt = `User travel saves:\n${savesSnapshot}\n\nUser question:\n${question}`;

  const callModel = async () => openai.chat.completions.create({
    model: "gpt-4o",
    max_completion_tokens: 4096,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  let rawContent = (await callModel()).choices[0]?.message?.content ?? "";
  let validated = verdictJsonSchema.safeParse(JSON.parse(rawContent));

  if (!validated.success) {
    console.warn("  Retrying (validation failed first attempt)...");
    rawContent = (await callModel()).choices[0]?.message?.content ?? "";
    validated = verdictJsonSchema.safeParse(JSON.parse(rawContent));
  }

  if (!validated.success) {
    throw new Error(`Verdict validation failed: ${JSON.stringify(validated.error.issues)}`);
  }

  return { rawContent, resultJson: validated.data, savesSnapshot };
}

// ── Profile definitions ────────────────────────────────────────────────────────

type SaveInput = {
  content: string;
  scrapedTitle: string;
  scrapedDescription: string;
  placeName: string;
  countryCode: string;
  lat: number;
  lng: number;
  tags: string[];
  category: string;
};

const ELENA_SAVES: SaveInput[] = [
  {
    content: "The kind of place where you eat the same dish three weeks in a row because it's that good. Morning market, mezcal after dark.",
    scrapedTitle: "Oaxaca, Mexico",
    scrapedDescription: "Oaxaca is Mexico's culinary heartland — tlayudas, mole negro, and chocolate markets at dawn. The city has a slow rhythm that rewards staying four weeks rather than four days.",
    placeName: "Oaxaca", countryCode: "MX", lat: 17.07, lng: -96.72,
    tags: ["slow travel", "food", "mezcal", "markets", "Mexico"], category: "destination",
  },
  {
    content: "Masseria country. Ancient olive groves, burrata fresh from the dairy, afternoon light that turns everything amber.",
    scrapedTitle: "Puglia, Italy",
    scrapedDescription: "The heel of Italy's boot: trulli houses, sea urchin pasta, and an agricultural culture that hasn't performed itself for tourists yet. Best in shoulder season.",
    placeName: "Puglia", countryCode: "IT", lat: 40.35, lng: 18.17,
    tags: ["Italy", "food", "slow travel", "countryside", "wine"], category: "destination",
  },
  {
    content: "The wine caves under the city are insane. Also: pastéis de nata at 7am, azulejos everywhere.",
    scrapedTitle: "Porto, Portugal",
    scrapedDescription: "Porto sits on a gorge above the Douro river — port wine caves, Art Nouveau bookshops, and a waterfront that hasn't been sanitized. Best visited with a loose schedule.",
    placeName: "Porto", countryCode: "PT", lat: 41.15, lng: -8.61,
    tags: ["wine", "Portugal", "food", "architecture", "walking"], category: "destination",
  },
  {
    content: "Eat your way through a village I can't pronounce. Fresh octopus, Cretan wine, mountain herbs.",
    scrapedTitle: "Crete, Greece",
    scrapedDescription: "The largest Greek island has its own cuisine, dialect, and pace. Kalitsounia pastries, dakos salads, and tavernas that open at 9pm and close when the last table leaves.",
    placeName: "Crete", countryCode: "GR", lat: 35.34, lng: 25.13,
    tags: ["Greece", "food", "islands", "slow travel", "affordable"], category: "destination",
  },
  {
    content: "Fado houses in Mouraria, cheap lunch at the market, tile-watching for hours.",
    scrapedTitle: "Lisbon, Portugal",
    scrapedDescription: "Lisbon runs on trams, fado, and pastéis. The older neighborhoods — Mouraria, Intendente — still have the rough edges that make a city interesting. Affordable relative to what you get.",
    placeName: "Lisbon", countryCode: "PT", lat: 38.72, lng: -9.14,
    tags: ["Portugal", "fado", "food", "city", "walking"], category: "destination",
  },
  {
    content: "The medina is medieval in the best way. Natural dyes, hammams, and pottery you'll actually use.",
    scrapedTitle: "Fez, Morocco",
    scrapedDescription: "Fez el-Bali is one of the world's largest intact medieval cities — 9,000 alleys, tanneries, mosques, and a food scene built on preserved lemons and slow-cooked tagine.",
    placeName: "Fez", countryCode: "MA", lat: 34.03, lng: -5.00,
    tags: ["Morocco", "medina", "food", "craft", "history"], category: "destination",
  },
  {
    content: "Truffle season in Norcia. Tiny hill town, incredible butchers, no one else is there in November.",
    scrapedTitle: "Umbria, Italy",
    scrapedDescription: "Umbria is the Italy that didn't make the Instagram circuit. Norcia for cured meats and truffles, Orvieto for white wine, Spoleto for a medieval city that functions like a normal town.",
    placeName: "Umbria", countryCode: "IT", lat: 42.79, lng: 13.10,
    tags: ["Italy", "truffle", "food", "off-season", "hill towns"], category: "destination",
  },
  {
    content: "Best meze I've ever had. Octopus drying in the sun, seafood that hasn't been dressed up.",
    scrapedTitle: "Thessaloniki, Greece",
    scrapedDescription: "Thessaloniki is Greece's second city and first city for food — loukoumades at midnight, bougatsa at sunrise, and a Byzantine museum that's actually interesting.",
    placeName: "Thessaloniki", countryCode: "GR", lat: 40.64, lng: 22.94,
    tags: ["Greece", "food", "history", "underrated", "meze"], category: "destination",
  },
  {
    content: "Cenotes, Mayan ruins, good accommodation without the resort feeling. Quieter than the coast.",
    scrapedTitle: "Mérida, Mexico",
    scrapedDescription: "The capital of Yucatán sits inland with a colonial center and market culture. Day trips to Chichén Itzá and dozens of cenotes. Better food than the beach towns, cheaper too.",
    placeName: "Mérida", countryCode: "MX", lat: 20.97, lng: -89.62,
    tags: ["Mexico", "Yucatan", "food", "ruins", "cenotes"], category: "destination",
  },
  {
    content: "The smallest EU capital. Baroque churches, Grand Harbour views, genuinely good restaurants in a tiny walled city.",
    scrapedTitle: "Valletta, Malta",
    scrapedDescription: "Valletta has one of the world's great harbours and a medieval street grid inside 900m walls. The food scene has improved dramatically. An easy winter base.",
    placeName: "Valletta", countryCode: "MT", lat: 35.90, lng: 14.51,
    tags: ["Malta", "history", "food", "harbor", "winter"], category: "destination",
  },
];

const JAMES_SAVES: SaveInput[] = [
  {
    content: "Cliffside villages, puffin season, and trails where you don't see another person for hours.",
    scrapedTitle: "Faroe Islands",
    scrapedDescription: "Eighteen islands in the North Atlantic — waterfalls flowing into the sea, grass-roofed villages, and a hiking infrastructure that's still raw. Atlantic weather that changes every hour.",
    placeName: "Faroe Islands", countryCode: "FO", lat: 61.89, lng: -6.91,
    tags: ["hiking", "remote", "Atlantic", "photography", "dramatic"], category: "destination",
  },
  {
    content: "Polar bears outnumber people. Midnight sun, total dark, no trees. This is what isolation actually means.",
    scrapedTitle: "Svalbard, Norway",
    scrapedDescription: "A Norwegian archipelago at 78°N — abandoned Soviet coal towns, polar bear territory, and fjords frozen solid in winter. The world's northernmost permanent settlement.",
    placeName: "Svalbard", countryCode: "NO", lat: 78.22, lng: 15.65,
    tags: ["Arctic", "polar", "remote", "photography", "wildlife"], category: "destination",
  },
  {
    content: "Torres del Paine in weather that wants to flatten you. Best hiking on earth, probably.",
    scrapedTitle: "Patagonia, Chile",
    scrapedDescription: "The southern tip of South America: granite towers, grey glaciers, and Patagonian wind that makes every step a decision. The W Circuit takes 5 days and is worth every blister.",
    placeName: "Patagonia", countryCode: "CL", lat: -51.03, lng: -73.00,
    tags: ["hiking", "Patagonia", "glaciers", "Torres del Paine", "dramatic"], category: "destination",
  },
  {
    content: "Sossusvlei at sunrise is the most alien landscape I've ever stood in. Skeleton Coast for the bleak poetry of it.",
    scrapedTitle: "Namibia",
    scrapedDescription: "One of earth's least-dense countries — the Namib Desert, the Skeleton Coast, and Etosha National Park. Long drives, extraordinary light, and wildlife without the crowds of East Africa.",
    placeName: "Namibia", countryCode: "NA", lat: -24.73, lng: 15.34,
    tags: ["desert", "photography", "Africa", "wildlife", "remote"], category: "destination",
  },
  {
    content: "Song-Kul lake at 3000m, nomadic yurt stays, and the Tian Shan peaks at dawn.",
    scrapedTitle: "Kyrgyzstan",
    scrapedDescription: "A landlocked Central Asian country that runs on horse culture, yurt hospitality, and mountain infrastructure that rewards self-reliance. Song-Kul and Ala-Archa are the anchors.",
    placeName: "Kyrgyzstan", countryCode: "KG", lat: 42.87, lng: 74.59,
    tags: ["Central Asia", "mountains", "nomadic", "yurt", "remote"], category: "destination",
  },
  {
    content: "Landmannalaugar on foot, F-roads by 4WD, rhyolite mountains in colors that shouldn't exist.",
    scrapedTitle: "Iceland Highlands",
    scrapedDescription: "The interior of Iceland — Landmannalaugar, Þórsmörk, and the Laugavegur trail. Only accessible in summer. Lunar landscape, geothermal springs, and genuinely empty terrain.",
    placeName: "Iceland Highlands", countryCode: "IS", lat: 63.99, lng: -19.07,
    tags: ["Iceland", "hiking", "highlands", "photography", "remote"], category: "destination",
  },
  {
    content: "Gobi desert, horse culture, Naadam festival if you time it right. The scale of the steppe is incomprehensible.",
    scrapedTitle: "Mongolia",
    scrapedDescription: "The world's most sparsely populated country — nomadic family stays, the Gobi Desert, and a landscape that makes you forget how large the world is. Naadam festival in July.",
    placeName: "Mongolia", countryCode: "MN", lat: 47.89, lng: 106.91,
    tags: ["Mongolia", "steppe", "nomadic", "horses", "Gobi"], category: "destination",
  },
  {
    content: "Active volcanoes you can hike to, helicopter trails to places with no roads, almost zero tourists.",
    scrapedTitle: "Kamchatka, Russia",
    scrapedDescription: "A Russian peninsula of 300 volcanoes and brown bears — the world's densest concentration of active volcanoes. No roads to most of it. Helicopter or nothing.",
    placeName: "Kamchatka", countryCode: "RU", lat: 53.01, lng: 158.65,
    tags: ["volcanoes", "Russia", "remote", "helicopter", "extreme"], category: "destination",
  },
  {
    content: "Ilulissat icefjord is a UNESCO site for a reason. Dog sled, aurora, and zero cruise-ship options I'd want.",
    scrapedTitle: "Greenland",
    scrapedDescription: "The world's largest island — Ilulissat icefjord, dog sledding in Sisimiut, and aurora hunting from October to March. Not set up for mass tourism, which is the whole point.",
    placeName: "Greenland", countryCode: "GL", lat: 69.22, lng: -51.10,
    tags: ["Arctic", "ice", "aurora", "dog sled", "isolation"], category: "destination",
  },
  {
    content: "Highest-altitude monastery circuit on earth. Pangong Lake. Zanskar by jeep.",
    scrapedTitle: "Ladakh, India",
    scrapedDescription: "A high-altitude desert in the Himalayas — Buddhist monastery circuit, Pangong Tso lake at 4,350m, and the Zanskar Valley. Summer only. The altitude is not a joke.",
    placeName: "Ladakh", countryCode: "IN", lat: 34.17, lng: 77.58,
    tags: ["India", "Himalayas", "altitude", "monasteries", "remote"], category: "destination",
  },
  {
    content: "Dragon blood trees, an endemic species rate unlike anywhere else. The most isolated island I could realistically get to.",
    scrapedTitle: "Socotra, Yemen",
    scrapedDescription: "A Yemeni archipelago in the Arabian Sea — dragon blood trees, turquoise beaches, and 37% endemic species. Flight logistics are complicated. That's what keeps it as it is.",
    placeName: "Socotra", countryCode: "YE", lat: 12.46, lng: 54.01,
    tags: ["Yemen", "endemic", "islands", "isolation", "rare"], category: "destination",
  },
];

const NINA_SAVES: SaveInput[] = [
  {
    content: "Shimokitazawa for vintage shops and live music. Yanaka for old Tokyo before the war. Nakameguro canal walk at dusk.",
    scrapedTitle: "Tokyo, Japan",
    scrapedDescription: "A city of neighborhoods — each one a different aesthetic universe. Shimokitazawa is vinyl and jazz bars. Yanaka is prewar wooden temples. Harajuku Ura-Hara is street fashion at its strictest.",
    placeName: "Tokyo", countryCode: "JP", lat: 35.69, lng: 139.69,
    tags: ["Japan", "neighborhoods", "design", "food", "culture"], category: "destination",
  },
  {
    content: "Bukchon Hanok Village for architecture. Ikseon-dong for the food and bars. Raw fish at Noryangjin market.",
    scrapedTitle: "Seoul, South Korea",
    scrapedDescription: "Seoul runs two cultural economies in parallel: thousand-year-old palace culture and a contemporary design and food scene that's setting global trends. Ikseon-dong is the hinge between them.",
    placeName: "Seoul", countryCode: "KR", lat: 37.57, lng: 126.98,
    tags: ["Korea", "design", "food", "architecture", "contemporary"], category: "destination",
  },
  {
    content: "Noma's residency moved the whole city's food culture. Vesterbro coffee scene, harbourfront architecture.",
    scrapedTitle: "Copenhagen, Denmark",
    scrapedDescription: "Copenhagen has one of the world's most coherent food cultures — restaurants below Noma that are still extraordinary. Cyclists, harbor baths, and a design industry that exports its aesthetic globally.",
    placeName: "Copenhagen", countryCode: "DK", lat: 55.68, lng: 12.57,
    tags: ["Denmark", "food", "design", "restaurants", "architecture"], category: "destination",
  },
  {
    content: "Roma Norte for design hotels. Mercado Jamaica for flowers and fruit at 6am. The museum quarter.",
    scrapedTitle: "Mexico City, Mexico",
    scrapedDescription: "CDMX has one of the world's great contemporary art scenes — Museo Tamayo, the Kurimanzutto gallery, and a neighborhood (Roma Norte) that got interesting fast and hasn't been sanitized yet.",
    placeName: "Mexico City", countryCode: "MX", lat: 19.43, lng: -99.13,
    tags: ["Mexico", "art", "design", "food", "contemporary"], category: "destination",
  },
  {
    content: "Kadıköy ferry market, Çukurcuma antique district, meyhane dinner with raki.",
    scrapedTitle: "Istanbul, Turkey",
    scrapedDescription: "Istanbul is a city of 15 million with Byzantine churches, Ottoman bazaars, and a contemporary art scene (Istanbul Biennial, SALT Galata) operating in parallel. Cross the Bosphorus and you're in Asia.",
    placeName: "Istanbul", countryCode: "TR", lat: 41.01, lng: 28.97,
    tags: ["Turkey", "history", "food", "art", "Bosphorus"], category: "destination",
  },
  {
    content: "Naschmarkt on a Saturday, Secession building, Kaffeehäuser for three hours with a book.",
    scrapedTitle: "Vienna, Austria",
    scrapedDescription: "Vienna operates at the intersection of empire and contemporary culture — the Kunsthistorisches Museum is across from a new art space, and the coffeehouse culture is a UNESCO Intangible Heritage.",
    placeName: "Vienna", countryCode: "AT", lat: 48.21, lng: 16.37,
    tags: ["Austria", "art", "coffee", "museums", "history"], category: "destination",
  },
  {
    content: "Xinyi design district, Shilin night market, the mountain trails are 20 minutes from downtown.",
    scrapedTitle: "Taipei, Taiwan",
    scrapedDescription: "Taipei is underrated in the best way — a contemporary design culture, the world's best night markets, and a mountain trail system that starts at the MRT. The food scene rewards deep exploration.",
    placeName: "Taipei", countryCode: "TW", lat: 25.03, lng: 121.56,
    tags: ["Taiwan", "food", "design", "night market", "hiking"], category: "destination",
  },
  {
    content: "Natural wine bars run by Georgian winemakers. Sulfur baths in Abanotubani. Soviet-era architecture that's genuinely strange.",
    scrapedTitle: "Tbilisi, Georgia",
    scrapedDescription: "Tbilisi sits at the edge of Europe and the Middle East — it has the world's oldest wine tradition (8,000 years), sulfur baths in a medieval district, and a contemporary art scene that moved here when rents got cheap.",
    placeName: "Tbilisi", countryCode: "GE", lat: 41.69, lng: 44.83,
    tags: ["Georgia", "wine", "art", "Soviet", "affordable"], category: "destination",
  },
  {
    content: "Baixa bookshops, caldo verde, Serralves contemporary museum, wine cave tour.",
    scrapedTitle: "Porto, Portugal",
    scrapedDescription: "Porto is a smaller, rougher Lisbon. The Serralves museum is world-class. The bookshops in Baixa are the real ones. Port wine cave tours in Vila Nova de Gaia take two hours and cost nothing.",
    placeName: "Porto", countryCode: "PT", lat: 41.15, lng: -8.61,
    tags: ["Portugal", "art", "wine", "bookshops", "museums"], category: "destination",
  },
  {
    content: "Jardin Majorelle, souk ceramics, and a riad courtyard with nothing to do at 2pm.",
    scrapedTitle: "Marrakech, Morocco",
    scrapedDescription: "Marrakech is overwhelming in a good way — the medina, the tanneries, and the Yves Saint Laurent garden. A riad in the medina changes the experience completely. Best in shoulder season.",
    placeName: "Marrakech", countryCode: "MA", lat: 31.63, lng: -7.99,
    tags: ["Morocco", "art", "design", "medina", "riad"], category: "destination",
  },
  {
    content: "LX Factory on a Sunday, Museu Berardo for contemporary art, grilled octopus at the market.",
    scrapedTitle: "Lisbon, Portugal",
    scrapedDescription: "Lisbon has one of the best contemporary art collections in Europe (Museu Berardo is free with the right ticket) and a food market scene that's still affordable. The light in October is extraordinary.",
    placeName: "Lisbon", countryCode: "PT", lat: 38.72, lng: -9.14,
    tags: ["Portugal", "art", "food", "museums", "walking"], category: "destination",
  },
];

// ── Decision questions per profile ────────────────────────────────────────────

const ELENA_QUESTIONS = [
  "I have 5 weeks in January. Should I go to Oaxaca or Puglia? I want slow mornings, fermented things, markets that aren't staged for visitors, and somewhere that doesn't feel packaged.",
  "How do I structure a month in Portugal — Lisbon, the Alentejo wine country, and then Porto? I move slowly and want each place to earn its time.",
  "October: Crete or Fez? I want to eat extremely well, affordably, without a reservation system or a tasting menu. Which one wins?",
];

const JAMES_QUESTIONS = [
  "Patagonia vs the Faroe Islands. I have 3 weeks in August and I want relentless hiking, dramatic views, and almost no other hikers. Which one?",
  "Mongolia and Kyrgyzstan back to back — is that too much? How do I sequence 3 weeks between them so neither feels rushed?",
  "Greenland or Svalbard for polar solitude in February. I'm not interested in a cruise ship or guided luxury — I want the real thing.",
  "I keep circling Kamchatka and Socotra. One has volcanoes, one has dragon blood trees. Which one actually delivers on isolation and strangeness?",
];

const NINA_QUESTIONS = [
  "Tokyo or Seoul for 5 days in April. I want to feel completely inside one visual culture — not tourist food, not highlights, the real texture of a neighborhood. Which city?",
  "Structure 10 days in Japan: I want Tokyo, at least one night in a proper ryokan, and Kyoto. Is there anywhere else that earns its place in that window?",
  "Copenhagen or Vienna for a long October weekend — I want galleries and a serious meal each night. Which city has the edge right now?",
  "Tbilisi or Marrakech: I want a city that gets under your skin, the kind that surprises you still on day four. Which one?",
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Clearing existing demo data...");
  await db.delete(decisionsTable).where(inArray(decisionsTable.userId, DEMO_USER_IDS));
  await db.delete(savesTable).where(inArray(savesTable.userId, DEMO_USER_IDS));
  console.log("Cleared.\n");

  const profiles: { userId: string; name: string; saves: typeof savesTable.$inferSelect[]; questions: string[] }[] = [
    { userId: "demo_elena", name: "Elena Vasquez", saves: [], questions: ELENA_QUESTIONS },
    { userId: "demo_james", name: "James Okoro", saves: [], questions: JAMES_QUESTIONS },
    { userId: "demo_nina", name: "Nina Chen", saves: [], questions: NINA_QUESTIONS },
  ];

  const rawSaves = [ELENA_SAVES, JAMES_SAVES, NINA_SAVES];

  // Insert saves
  for (let i = 0; i < profiles.length; i++) {
    const profile = profiles[i];
    const saveInputs = rawSaves[i];
    console.log(`Inserting ${saveInputs.length} saves for ${profile.name}...`);

    for (const s of saveInputs) {
      const [inserted] = await db.insert(savesTable).values({
        userId: profile.userId,
        content: s.content,
        scrapedTitle: s.scrapedTitle,
        scrapedDescription: s.scrapedDescription,
        placeName: s.placeName,
        countryCode: s.countryCode,
        lat: s.lat,
        lng: s.lng,
        tags: JSON.stringify(s.tags),
        category: s.category,
      }).returning();
      profile.saves.push(inserted);
    }
    console.log(`  Inserted ${profile.saves.length} saves.\n`);
  }

  // Generate decisions
  for (const profile of profiles) {
    console.log(`\nGenerating decisions for ${profile.name} (${profile.questions.length} questions)...`);
    for (const question of profile.questions) {
      console.log(`  Q: "${question.slice(0, 80)}..."`);
      try {
        const { rawContent, resultJson, savesSnapshot } = await generateDecision(question, profile.saves);
        await db.insert(decisionsTable).values({
          userId: profile.userId,
          question,
          result: rawContent,
          resultJson,
          savesSnapshot,
        });
        console.log(`  ✓ Verdict: "${resultJson.verdict}"`);
      } catch (err) {
        console.error(`  ✗ Failed:`, err);
      }
    }
  }

  console.log("\nDone! Demo profiles seeded successfully.");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
