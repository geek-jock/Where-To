/**
 * Seed 5 demo profiles with realistic saves, AI-generated decisions,
 * travel profiles, 3 group trips with overview notes, decision rooms,
 * comments, and bilateral friend shares.
 *
 * Run:
 *   cd artifacts/api-server && \
 *   node_modules/.bin/esbuild src/scripts/seed-demo.ts --bundle --platform=node --format=cjs \
 *     --outfile=/tmp/seed-demo.cjs && node /tmp/seed-demo.cjs
 */

import {
  db,
  savesTable,
  decisionsTable,
  tripsTable,
  tripMembersTable,
  groupDecisionsTable,
  decisionCommentsTable,
  userProfilesTable,
  saveShareRequestsTable,
  tripOverviewNotesTable,
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { verdictJsonSchema, groupVerdictJsonSchema } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const DEMO_USER_IDS = ["demo_elena", "demo_james", "demo_nina", "demo_marco", "demo_priya"];

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
      model: "gpt-5.4-mini",
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
    const parts = [`ID:${s.id}`];
    if (s.note) parts.push(s.note);
    if (s.scrapedTitle) parts.push(`Title: ${s.scrapedTitle}`);
    if (s.description) parts.push(`Description: ${s.description}`);
    return parts.join("\n");
  }).join("\n\n---\n\n");

  const questionType = await classifyQuestion(question);
  const systemPrompt = questionType === "structure" ? STRUCTURE_SYSTEM_PROMPT : CHOOSE_SYSTEM_PROMPT;
  const userPrompt = `User travel saves:\n${savesSnapshot}\n\nUser question:\n${question}`;

  const callModel = async () => openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 8192,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
  });

  const tryParse = (raw: string) => {
    try {
      const parsed = JSON.parse(raw);
      return verdictJsonSchema.safeParse(parsed);
    } catch {
      return { success: false as const, error: new Error("JSON parse failed") };
    }
  };

  let rawContent = (await callModel()).choices[0]?.message?.content ?? "";
  let validated = tryParse(rawContent);

  if (!validated.success) {
    console.warn("  Retrying (validation failed first attempt)...");
    rawContent = (await callModel()).choices[0]?.message?.content ?? "";
    validated = tryParse(rawContent);
  }

  if (!validated.success) {
    throw new Error(`Verdict validation failed after retry`);
  }

  return { rawContent, resultJson: validated.data, savesSnapshot };
}

// ── Profile definitions ────────────────────────────────────────────────────────

type SaveInput = {
  url: string;
  note: string;
  scrapedTitle: string;
  description: string;
  placeName: string;
  countryCode: string;
  lat: number;
  lng: number;
  tags: string[];
  category: string;
};

const ELENA_SAVES: SaveInput[] = [
  {
    url: "https://www.reddit.com/r/solotravel/comments/18xkp2q/oaxaca_for_5_weeks_anyone_done_this/",
    note: "found this thread when i was researching a longer oaxaca stay. someone mentioned renting in jalatlaco neighborhood for $600/month and i can't stop thinking about it",
    scrapedTitle: "Oaxaca for 5 weeks — anyone done this? : r/solotravel",
    description: "Jalatlaco neighborhood in Oaxaca offers furnished rooms from $600/month — a slow-travel base with serious mezcal bars and the Mercado 20 de Noviembre at your doorstep.",
    placeName: "Oaxaca", countryCode: "MX", lat: 17.07, lng: -96.72,
    tags: ["slow travel", "food", "mezcal", "markets"], category: "destination",
  },
  {
    url: "https://www.airbnb.com/rooms/52847361",
    note: "this is the masseria my friend stayed at near lecce. she was there 3 weeks last september and said she never wanted to leave. need to check if they do longer bookings",
    scrapedTitle: "Masseria Montenapoleone — farmhouse stay near Lecce, Puglia",
    description: "A 400-year-old masseria on a working olive and grape farm near Lecce — breakfast and dinner included, minimum 7 nights in shoulder season.",
    placeName: "Puglia", countryCode: "IT", lat: 40.35, lng: 18.17,
    tags: ["Italy", "food", "slow travel", "masseria", "wine"], category: "resort",
  },
  {
    url: "https://www.instagram.com/p/C3mNxKVOrwI/",
    note: "bookmarked this for the porto wine caves. four hours of tastings for basically nothing?? that's the whole vibe right there",
    scrapedTitle: "The cellars under Vila Nova de Gaia are one of the great free afternoons in Europe",
    description: "Port wine caves under Vila Nova de Gaia — most cellars charge €5–10 for 2–3 pours, with terrace views over the Douro. Best visited on a weekday.",
    placeName: "Porto", countryCode: "PT", lat: 41.15, lng: -8.61,
    tags: ["wine", "Portugal", "food", "walking"], category: "experience",
  },
  {
    url: "https://www.seriouseats.com/cretan-food-what-to-eat-in-crete-greece",
    note: "went down a rabbit hole about cretan food. the dakos thing sounds incredible. want to go in october when it's empty",
    scrapedTitle: "The Essential Guide to Cretan Food: What to Eat in Crete",
    description: "Cretan cuisine runs deep — dakos salad, kalitsounia pastries, and lamb with stamnagathi greens. October means empty villages and the best produce of the season.",
    placeName: "Crete", countryCode: "GR", lat: 35.34, lng: 25.13,
    tags: ["Greece", "food", "islands", "slow travel", "affordable"], category: "destination",
  },
  {
    url: "https://www.reddit.com/r/portugal/comments/1c2qfk8/mouraria_vs_intendente_where_to_stay_in_lisbon/",
    note: "trying to figure out which lisbon neighbourhood to base in for a longer stay. the intendente market looks really good. need to check november pricing",
    scrapedTitle: "Mouraria vs Intendente — where to stay in Lisbon for 3+ weeks? : r/portugal",
    description: "Intendente beats Mouraria for a longer stay — Sunday market, more local feel, and furnished rooms under €900/month on Uniplaces.",
    placeName: "Lisbon", countryCode: "PT", lat: 38.72, lng: -9.14,
    tags: ["Portugal", "fado", "food", "city", "walking"], category: "neighborhood",
  },
  {
    url: "https://www.messynessychic.com/2023/10/fez-guide-medina-leather-tanneries/",
    note: "this blog post finally made me actually want to go to fez. the hammam recommendation near the andalusian mosque — saving that specifically",
    scrapedTitle: "The Only Fez Guide You Need (For People Who Hate Guides)",
    description: "Fez el-Bali's 9,000 alleyways reward getting lost — go to the Chouara tannery early, then find the hammam near the Andalusian mosque that locals actually use for 15 dirhams.",
    placeName: "Fez", countryCode: "MA", lat: 34.03, lng: -5.00,
    tags: ["Morocco", "medina", "food", "craft", "hammam"], category: "destination",
  },
  {
    url: "https://www.bonappetit.com/story/umbria-italy-truffle-hunting-norcia",
    note: "norcia in november. truffle market on saturdays. literally no one else is there. this is exactly the kind of thing i'm always trying to find",
    scrapedTitle: "In Umbria, Truffle Season Is the Whole Point",
    description: "Norcia in November is ground zero for black truffle season — Saturday market by the basilica from 8am, with prices a fraction of what London restaurants charge.",
    placeName: "Umbria", countryCode: "IT", lat: 42.79, lng: 13.10,
    tags: ["Italy", "truffle", "food", "off-season", "hill towns"], category: "market",
  },
  {
    url: "https://www.reddit.com/r/solotravel/comments/1b4hkl9/thessaloniki_is_shockingly_good_and_nobody_talks/",
    note: "this is the kind of post i save and never act on. 10 days in thessaloniki with basically free food brought with every drink?? need to look at october flights",
    scrapedTitle: "Thessaloniki is shockingly good and nobody talks about it : r/solotravel",
    description: "Thessaloniki's meze culture means small plates arrive with every drink at no extra charge — the waterfront fish tavernas are fresher than anything in Athens, and rent is cheap.",
    placeName: "Thessaloniki", countryCode: "GR", lat: 40.64, lng: 22.94,
    tags: ["Greece", "food", "underrated", "meze", "affordable"], category: "destination",
  },
  {
    url: "https://www.lonelyplanet.com/articles/best-things-to-do-merida-mexico",
    note: "keeping this as an alternative to oaxaca. quieter, more affordable apparently, and the cenotes don't have influencers in them",
    scrapedTitle: "The best things to do in Mérida, Mexico's most underrated city",
    description: "Mérida's Sunday market fills the main square with hammock vendors and local food — day trips to cenotes near Homún cost a fraction of anything near Tulum.",
    placeName: "Mérida", countryCode: "MX", lat: 20.97, lng: -89.62,
    tags: ["Mexico", "Yucatan", "food", "cenotes", "affordable"], category: "destination",
  },
  {
    url: "https://www.booking.com/hotel/mt/casa-ellul-valletta.html",
    note: "valletta for january? this guesthouse keeps coming up. the city size is the appeal — walk everywhere, no decisions needed",
    scrapedTitle: "Casa Ellul, Valletta – Updated 2025 Prices",
    description: "Seven-room boutique guesthouse in a historic Valletta palazzo, steps from the Grand Harbour — breakfast included, free cancellation, walkable to everything.",
    placeName: "Valletta", countryCode: "MT", lat: 35.90, lng: 14.51,
    tags: ["Malta", "history", "food", "harbor", "winter"], category: "hotel",
  },
];

const JAMES_SAVES: SaveInput[] = [
  {
    url: "https://www.alltrails.com/trail/faroe-islands/streymoy/slaetaratindur-summit",
    note: "highest point in the faroes. looks totally manageable without a guide. want to do this in august when the puffins are still there",
    scrapedTitle: "Slaettaratindur Summit Trail — AllTrails",
    description: "Faroe Islands' highest point at 882m — 3–4 hours round trip from Eiðisvatn lake with puffin colonies visible from the ridge until late August.",
    placeName: "Faroe Islands", countryCode: "FO", lat: 61.89, lng: -6.91,
    tags: ["hiking", "remote", "Atlantic", "photography", "puffins"], category: "activity",
  },
  {
    url: "https://www.thebrokebackpacker.com/svalbard-travel-guide-without-cruise/",
    note: "svalbard without a cruise is actually doable. february polar night, snowmobile rentals out of longyearbyen. need to check costs",
    scrapedTitle: "How to Do Svalbard Without a Cruise Ship (A Practical Guide)",
    description: "Svalbard independent: Longyearbyen guesthouses, snowmobile rentals from ~$150/day, and small-group snowshoeing into the backcountry for under $100 during polar night.",
    placeName: "Svalbard", countryCode: "NO", lat: 78.22, lng: 15.65,
    tags: ["Arctic", "polar", "remote", "snowmobile", "wildlife"], category: "destination",
  },
  {
    url: "https://www.reddit.com/r/solotravel/comments/1amqx6t/just_finished_the_w_circuit_torres_del_paine_ama/",
    note: "this ama convinced me. august off-season on the W circuit, 20 people over 5 days. that's exactly what i want",
    scrapedTitle: "Just finished the W Circuit — Torres del Paine. AMA : r/solotravel",
    description: "August on the W Circuit means roughly 20 people over 5 days — brutal wind, excellent waymarking, refugios with space, and ~$50/day all in.",
    placeName: "Patagonia", countryCode: "CL", lat: -51.03, lng: -73.00,
    tags: ["hiking", "Patagonia", "glaciers", "off-season", "solo"], category: "activity",
  },
  {
    url: "https://www.nationalgeographic.com/travel/article/namibia-sossusvlei-skeleton-coast-guide",
    note: "skeleton coast has been on my mind for 2 years. self-drive looks doable with the right 4wd. need to get there before it gets discovered",
    scrapedTitle: "The remote wonder of Namibia: dunes, desert, and the Skeleton Coast",
    description: "The Skeleton Coast beyond Swakopmund is a full day on gravel with almost no infrastructure — bleaker and quieter than Sossusvlei, and still largely undiscovered.",
    placeName: "Namibia", countryCode: "NA", lat: -24.73, lng: 15.34,
    tags: ["desert", "photography", "Africa", "self-drive", "remote"], category: "destination",
  },
  {
    url: "https://www.caravanistan.com/kyrgyzstan/song-kol-lake/",
    note: "song-kul in july. nomadic yurt stay, no signal, horses. this is the kind of place where you actually stop checking your phone",
    scrapedTitle: "Song-Kul Lake: Complete Guide to Kyrgyzstan's High-Altitude Lake",
    description: "Song-Kul sits at 3,016m accessible June–September — yurt stays with nomadic families, horses to hire, no phone signal, no electricity, and disorientingly beautiful sunrises.",
    placeName: "Kyrgyzstan", countryCode: "KG", lat: 42.87, lng: 74.59,
    tags: ["Central Asia", "mountains", "nomadic", "yurt", "horses"], category: "experience",
  },
  {
    url: "https://www.lonelyplanet.com/articles/laugavegur-trail-guide",
    note: "want to do laugavegur in august. self-guided with hut bookings. been looking at f-road access for landmannalaugar approach",
    scrapedTitle: "The Laugavegur Trail: Iceland's most spectacular hike, fully explained",
    description: "55km through Iceland's highlands — rhyolite mountains, geothermal springs, obsidian fields, and snow crossings in August. Mountain huts book out months ahead.",
    placeName: "Iceland Highlands", countryCode: "IS", lat: 63.99, lng: -19.07,
    tags: ["Iceland", "hiking", "highlands", "photography", "huts"], category: "activity",
  },
  {
    url: "https://www.youtube.com/watch?v=4pPQ2jK0x5E",
    note: "watched this twice. the logistics section is really useful. thinking gobi + horse trek in the north. 3 weeks minimum",
    scrapedTitle: "30 Days Traveling Mongolia Alone — What Nobody Tells You",
    description: "Mongolia independent needs planning but works: Ulaanbaatar guesthouses organize everything, the Gobi alone deserves 5 days, and budget is ~$30–40/day outside UB.",
    placeName: "Mongolia", countryCode: "MN", lat: 47.89, lng: 106.91,
    tags: ["Mongolia", "steppe", "nomadic", "Gobi", "horses"], category: "destination",
  },
  {
    url: "https://www.reddit.com/r/solotravel/comments/11nkw2p/kamchatka_solo_trip_report_what_i_wish_id_known/",
    note: "need to actually look at the permit situation for kamchatka. helicopter costs are real but the volcanic fields you can only reach that way look insane",
    scrapedTitle: "Kamchatka solo trip report — what I wish I'd known : r/solotravel",
    description: "Kamchatka backcountry requires a registered guide by law. Helicopter access to the Tolbachik lava fields runs $300–500 by group size — worth every ruble.",
    placeName: "Kamchatka", countryCode: "RU", lat: 53.01, lng: 158.65,
    tags: ["volcanoes", "Russia", "remote", "helicopter", "extreme"], category: "destination",
  },
  {
    url: "https://www.visitgreenland.com/inspiration/dog-sledding-in-greenland/",
    note: "february dog sledding out of sisimiut. looks genuinely different from svalbard — more remote, different culture. pricing seems reasonable",
    scrapedTitle: "Dog Sledding in Greenland — The Complete Experience Guide",
    description: "Sisimiut is the base for traditional dog sledding February–April — smaller than Ilulissat, less touristed, traveling with Greenlandic mushers on multi-day ice sheet camps.",
    placeName: "Greenland", countryCode: "GL", lat: 69.22, lng: -51.10,
    tags: ["Arctic", "ice", "aurora", "dog sled", "culture"], category: "experience",
  },
  {
    url: "https://www.reddit.com/r/india/comments/1d9vf2m/solo_ladakh_trip_report_zanskar_valley_by_jeep/",
    note: "this trip report is exactly what i needed for ladakh. zanskar valley by jeep, monastery stays, pangong at the end. permits are complicated but doable solo",
    scrapedTitle: "Solo Ladakh trip report: Zanskar Valley by jeep [very detailed] : r/india",
    description: "Zanskar Valley road takes two full days from Kargil on mostly unpaved track — monastery guesthouses at $10–15/night, altitude hits hard at Rangdum (3,800m), Pangong Tso at the end.",
    placeName: "Ladakh", countryCode: "IN", lat: 34.17, lng: 77.58,
    tags: ["India", "Himalayas", "altitude", "monasteries", "jeep"], category: "destination",
  },
  {
    url: "https://www.atlasobscura.com/articles/how-to-get-to-socotra-island",
    note: "logistics for socotra are genuinely painful. abu dhabi charter seems to be the main route now. been sitting on this for 6 months wondering if i'll actually pull the trigger",
    scrapedTitle: "The Complicated, Rewarding Quest to Reach the 'Galápagos of the Indian Ocean'",
    description: "Socotra requires a charter flight from Abu Dhabi or the intermittent Yemenia route from Cairo — dragon blood trees, empty beaches, 2–3 weeks for the permit process.",
    placeName: "Socotra", countryCode: "YE", lat: 12.46, lng: 54.01,
    tags: ["Yemen", "endemic", "islands", "remote", "rare"], category: "destination",
  },
];

const NINA_SAVES: SaveInput[] = [
  {
    url: "https://maps.app.goo.gl/Kz8wNrQzJf7jDmXt7",
    note: "shimokitazawa keeps coming up every time i research tokyo. saved this bar from a friend's google maps list. want to spend at least 2 evenings in this neighbourhood",
    scrapedTitle: "Shirube · Izakaya · Shimokitazawa, Tokyo",
    description: "Natural wine and sake izakaya in Shimokitazawa — rotating small plates, interesting bottle list, mostly neighborhood regulars. Opens 6pm, closed Tuesdays.",
    placeName: "Tokyo", countryCode: "JP", lat: 35.69, lng: 139.69,
    tags: ["Japan", "neighborhoods", "music", "wine", "food"], category: "bar",
  },
  {
    url: "https://www.eater.com/22327801/ikseon-dong-seoul-guide-restaurants-bars",
    note: "ikseon-dong for the converted hanok bars. this eater piece convinced me seoul has something tokyo doesn't right now",
    scrapedTitle: "Ikseon-dong Is Seoul's Most Interesting Neighbourhood Right Now",
    description: "Ikseon-dong's Korean hanok buildings converted into wine bars and omakase spots — the contrast between traditional architecture and what's inside is the whole point.",
    placeName: "Seoul", countryCode: "KR", lat: 37.57, lng: 126.98,
    tags: ["Korea", "food", "bars", "design", "neighborhoods"], category: "neighborhood",
  },
  {
    url: "https://www.timeout.com/amsterdam/art/best-museums-in-amsterdam",
    note: "the moco museum looks more interesting than the rijksmuseum honestly. banksy + dali in the same place?",
    scrapedTitle: "The 12 best museums in Amsterdam right now",
    description: "Amsterdam's MOCO Museum pairs Banksy and Dalí in a 17th-century mansion on Museumplein — smaller and more focused than the Rijksmuseum, no advance booking needed.",
    placeName: "Amsterdam", countryCode: "NL", lat: 52.36, lng: 4.90,
    tags: ["Netherlands", "art", "design", "museums", "city"], category: "museum",
  },
  {
    url: "https://www.eater.com/maps/best-restaurants-paris-where-to-eat",
    note: "classic eater map but the natural wine bar section is actually useful. need to stop just pinning these and go",
    scrapedTitle: "Where to Eat in Paris Right Now",
    description: "Eater Paris's natural wine bar picks cover the spots that locals actually fill — the Oberkampf and Pigalle sections are where the real dining happens.",
    placeName: "Paris", countryCode: "FR", lat: 48.86, lng: 2.35,
    tags: ["France", "food", "wine", "bistro", "city"], category: "restaurant",
  },
  {
    url: "https://www.wallpaper.com/art/best-contemporary-art-galleries-berlin",
    note: "the neugerriemschneider gallery has been on my list for years. east berlin gallery district looks like it could eat a whole day",
    scrapedTitle: "The best contemporary art galleries in Berlin",
    description: "Berlin's East gallery district anchored by neugerriemschneider — serious contemporary work in former industrial spaces, most open Tuesday–Saturday.",
    placeName: "Berlin", countryCode: "DE", lat: 52.52, lng: 13.40,
    tags: ["Germany", "art", "galleries", "design", "city"], category: "gallery",
  },
  {
    url: "https://www.cntraveler.com/story/where-to-eat-in-mexico-city",
    note: "condesa keeps coming up for where to actually base yourself. the restaurant density looks insane for a small neighbourhood",
    scrapedTitle: "Where to Eat in Mexico City Right Now",
    description: "Condesa and Roma Norte in Mexico City offer some of the highest restaurant density per block in Latin America — tasting menus alongside excellent tacos on the same street.",
    placeName: "Mexico City", countryCode: "MX", lat: 19.43, lng: -99.13,
    tags: ["Mexico", "food", "restaurants", "city", "neighborhoods"], category: "neighborhood",
  },
  {
    url: "https://www.timeout.com/hong-kong/art/hong-kong-art-galleries",
    note: "art basel hong kong is in march. staying for a week after to see the permanent galleries looks actually viable now",
    scrapedTitle: "The best art galleries in Hong Kong",
    description: "Hong Kong's gallery scene runs from Pedder Street to Wong Chuk Hang — Art Basel in March is the peak, but the permanent spaces justify a standalone visit.",
    placeName: "Hong Kong", countryCode: "HK", lat: 22.32, lng: 114.17,
    tags: ["Hong Kong", "art", "galleries", "city", "food"], category: "gallery",
  },
  {
    url: "https://www.eater.com/maps/best-restaurants-lisbon",
    note: "the tasca and taberna section in the eater lisbon map is what i actually care about. none of the tourist stuff",
    scrapedTitle: "Where to Eat in Lisbon Right Now",
    description: "Lisbon's tascas in Mouraria and Intendente are where the real food is — petiscos, natural wine, and full meals under €25 in rooms that seat twenty people.",
    placeName: "Lisbon", countryCode: "PT", lat: 38.72, lng: -9.14,
    tags: ["Portugal", "food", "wine", "city", "neighborhoods"], category: "restaurant",
  },
  {
    url: "https://www.wallpaper.com/travel/best-hotels-tokyo",
    note: "the trunk hotel in shibuya keeps coming up. looks like it actually has a good bar scene attached",
    scrapedTitle: "The best hotels in Tokyo",
    description: "Trunk Hotel in Shibuya is the design-forward pick — small, serious bar program, and positioned between Daikanyama and the station.",
    placeName: "Tokyo", countryCode: "JP", lat: 35.66, lng: 139.70,
    tags: ["Japan", "design", "hotel", "bar", "city"], category: "hotel",
  },
  {
    url: "https://www.cntraveler.com/story/best-restaurants-new-york",
    note: "actually planning a proper food trip to new york in the spring. the tribeca and lower east side picks look right",
    scrapedTitle: "The Best Restaurants in New York City Right Now",
    description: "New York's best dining right now is concentrated in Tribeca and the Lower East Side — the list skews tasting menu and natural wine, with a few serious taco counters.",
    placeName: "New York City", countryCode: "US", lat: 40.71, lng: -74.01,
    tags: ["USA", "food", "restaurants", "city", "art"], category: "restaurant",
  },
];

const MARCO_SAVES: SaveInput[] = [
  {
    url: "https://www.ericeira.surf/surf-spots/",
    note: "ericeira is the only world surfing reserve in europe. the ribeira d'ilhas spot looks doable at my level if i time it right. an hour from lisbon is perfect",
    scrapedTitle: "Ericeira Surf Spots Guide — World Surfing Reserve",
    description: "Ericeira's world surfing reserve covers 8 surf spots across 4km of coastline — Ribeira d'Ilhas handles beginners on smaller days, experts on swells over 2m.",
    placeName: "Ericeira", countryCode: "PT", lat: 38.96, lng: -9.42,
    tags: ["surf", "Portugal", "Atlantic", "nomad", "outdoors"], category: "activity",
  },
  {
    url: "https://nomadlist.com/las-palmas-de-gran-canaria",
    note: "las palmas keeps topping nomad rankings for a reason. winter sun, cheap coffee, surf at las canteras right in the city. been thinking about this for february",
    scrapedTitle: "Las Palmas de Gran Canaria — Nomad List",
    description: "Las Palmas ranks #1 for European winter nomads — year-round 22°C, Las Canteras city beach surf, fiber in most cafes, and cost of living 30% below Lisbon.",
    placeName: "Gran Canaria", countryCode: "ES", lat: 28.12, lng: -15.43,
    tags: ["nomad", "surf", "Spain", "Canaries", "remote work"], category: "destination",
  },
  {
    url: "https://www.timeout.com/lisbon/things-to-do/best-coworking-spaces-in-lisbon",
    note: "the outsite lisbon rooftop is the one everyone mentions. €25/day sounds steep but if the wifi is actually reliable it's worth it vs fighting cafe noise",
    scrapedTitle: "The best coworking spaces in Lisbon",
    description: "Outsite Lisbon's rooftop coworking is the cleanest setup for nomads — €25/day or €350/month, reliable gigabit wifi, and standing desks with river views.",
    placeName: "Lisbon", countryCode: "PT", lat: 38.72, lng: -9.14,
    tags: ["Portugal", "coworking", "nomad", "remote work", "city"], category: "coworking",
  },
  {
    url: "https://www.madeira.best/coworking-and-digital-nomad/",
    note: "funchal is genuinely affordable for a EU destination. the levada walks look incredible and you can surf on the north coast",
    scrapedTitle: "Madeira for Digital Nomads — The Complete 2025 Guide",
    description: "Funchal has the best nomad infrastructure in the Atlantic islands — NOS fiber, coworking from €15/day, levada walking trails, and surf at Jardim do Mar.",
    placeName: "Madeira", countryCode: "PT", lat: 32.66, lng: -16.92,
    tags: ["Portugal", "nomad", "surf", "hiking", "Atlantic"], category: "destination",
  },
  {
    url: "https://www.surfersvillage.com/bali-surfing/canggu/",
    note: "canggu is oversaturated now but echo beach still produces consistent lefts without the kuta crowds. need to figure out if november or april is better",
    scrapedTitle: "Surfing Canggu, Bali — Echo Beach to Pererenan",
    description: "Canggu's Echo Beach handles consistent 1–2m lefts from April to October — Pererenan is quieter than the main break and only 10 minutes west by scooter.",
    placeName: "Bali", countryCode: "ID", lat: -8.65, lng: 115.13,
    tags: ["surf", "Bali", "Indonesia", "nomad", "affordable"], category: "activity",
  },
  {
    url: "https://nomadlist.com/chiang-mai",
    note: "chiang mai is the classic nomad hub for a reason. 12mbps average on nomad wifi, $600/month for a nice apartment, saturday walking street for produce",
    scrapedTitle: "Chiang Mai — Nomad List",
    description: "Chiang Mai: $600–900/month all-in, 90+ coworking spaces, food from $1–3, and a genuinely walkable old city once you get off the tourist circuit.",
    placeName: "Chiang Mai", countryCode: "TH", lat: 18.79, lng: 98.98,
    tags: ["Thailand", "nomad", "affordable", "remote work", "Asia"], category: "destination",
  },
  {
    url: "https://www.thesurfatlas.com/surf-spots/morocco/taghazout/",
    note: "taghazout surf season is october to april. anchor point is a world class wave and the town is still affordable. might combine with a few days in agadir",
    scrapedTitle: "Taghazout Surf Guide — Morocco's Best Wave",
    description: "Taghazout's Anchor Point produces world-class right-handers from October to March — the town is scruffy and cheap, surf camps from €30/day including accommodation.",
    placeName: "Taghazout", countryCode: "MA", lat: 30.54, lng: -9.71,
    tags: ["surf", "Morocco", "Africa", "affordable", "off-season"], category: "activity",
  },
  {
    url: "https://www.surfline.com/surf-report/peniche/5842041f4e65fad6a7708912",
    note: "supertubos is the portuguese pipe. if i'm basing in lisbon i should make a weekend of this. 90 minutes north, camping right by the break",
    scrapedTitle: "Peniche Surf Report & Forecast — Supertubos",
    description: "Peniche's Supertubos is one of Europe's best beach breaks — a 90-min drive from Lisbon, camping 200m from the shore, and consistent hollow barrels October through April.",
    placeName: "Peniche", countryCode: "PT", lat: 39.35, lng: -9.38,
    tags: ["surf", "Portugal", "Atlantic", "camping", "weekend"], category: "activity",
  },
  {
    url: "https://nomadlist.com/tbilisi",
    note: "tbilisi is having a moment right now. visa on arrival, wine culture, soviet architecture, startup scene. i had no idea it was this good",
    scrapedTitle: "Tbilisi, Georgia — Nomad List",
    description: "Tbilisi: 1-year visa on arrival for most nationalities, $700/month living costs, wine bars in sulfur bath district, fast fiber in co-working cafes, mountains 1hr away.",
    placeName: "Tbilisi", countryCode: "GE", lat: 41.69, lng: 44.83,
    tags: ["Georgia", "nomad", "wine", "Caucasus", "affordable"], category: "destination",
  },
  {
    url: "https://www.lonelyplanet.com/articles/digital-nomad-guide-mexico-city",
    note: "roma norte for a month sounds ideal. the coffee scene is apparently serious, it's cheap relative to european cities, and there are waves 3 hours away in oaxaca coast",
    scrapedTitle: "Mexico City for Digital Nomads: Roma Norte and Beyond",
    description: "Mexico City's Roma Norte offers cafe wifi culture at $2/coffee, furnished apartments from $900/month, and an easy overnight bus to surf breaks at Zipolite.",
    placeName: "Mexico City", countryCode: "MX", lat: 19.43, lng: -99.13,
    tags: ["Mexico", "nomad", "food", "remote work", "surf"], category: "destination",
  },
];

const PRIYA_SAVES: SaveInput[] = [
  {
    url: "https://www.theworlds50best.com/the-list/1-10.html",
    note: "using this as a baseline for peru vs japan comparison. table 1 was worth it even just for the dashi — still thinking about it",
    scrapedTitle: "The World's 50 Best Restaurants 2025",
    description: "The World's 50 Best 2025 list — useful as a starting framework even if you end up off-list. The top ten alone requires booking 3–6 months ahead.",
    placeName: "Global", countryCode: "JP", lat: 35.68, lng: 139.69,
    tags: ["fine dining", "Michelin", "Japan", "research", "food"], category: "restaurant",
  },
  {
    url: "https://www.theguardian.com/travel/2023/sep/12/kyoto-kaiseki-dinner-guide-restaurants",
    note: "kyoto kaiseki is the meal i keep putting off because of the price. this guardian piece made it feel less intimidating — some courses are under ¥15,000",
    scrapedTitle: "A guide to kyoto's best kaiseki restaurants — from the affordable to the extraordinary",
    description: "Kyoto kaiseki ranges from ¥8,000 lunch courses to ¥50,000 dinner experiences — the mid-range (¥15–20k) hits all the seasonal precision without the full ceremonial overhead.",
    placeName: "Kyoto", countryCode: "JP", lat: 34.97, lng: 135.77,
    tags: ["Japan", "kaiseki", "fine dining", "seasonal", "Kyoto"], category: "restaurant",
  },
  {
    url: "https://www.eater.com/maps/best-san-sebastian-restaurants-basque-country",
    note: "san sebastian is on my standing list. the pintxos bars in parte vieja are non-negotiable but arzak for one dinner is the real goal",
    scrapedTitle: "Where to Eat in San Sebastián Right Now",
    description: "San Sebastián packs more Michelin stars per capita than any city in the world — Arzak and Mugaritz for the benchmark, Ganbara and Bar Bergara for pintxos with no compromise.",
    placeName: "San Sebastián", countryCode: "ES", lat: 43.32, lng: -1.98,
    tags: ["Spain", "Basque", "fine dining", "pintxos", "Michelin"], category: "restaurant",
  },
  {
    url: "https://www.bonappetit.com/story/best-restaurants-mumbai-india",
    note: "the bombay canteen is what i show people when they say indian food is just curry. their thali has 11 components. need to get back",
    scrapedTitle: "The Best Restaurants in Mumbai Right Now",
    description: "Mumbai's dining scene runs from The Bombay Canteen's modern Indian thali to Wasabi by Morimoto in Colaba — the Bandra dining strip competes with any neighbourhood in Asia.",
    placeName: "Mumbai", countryCode: "IN", lat: 19.08, lng: 72.88,
    tags: ["India", "fine dining", "food", "city", "modern Indian"], category: "restaurant",
  },
  {
    url: "https://www.japantimes.co.jp/food/2023/11/osaka-street-food-guide-dotonbori/",
    note: "takoyaki at the right place in dotonbori is not a tourist thing — it's actually one of the better snacks in the world. the japan times piece gets this right",
    scrapedTitle: "The real guide to Osaka street food in Dotonbori",
    description: "Osaka's Dotonbori takoyaki benchmark: Wanaka takoyaki, Aizuya, or the Kuromon Market stalls — the correct order is always 8 pieces, standing, with pickled ginger.",
    placeName: "Osaka", countryCode: "JP", lat: 34.67, lng: 135.50,
    tags: ["Japan", "street food", "Osaka", "food", "affordable"], category: "market",
  },
  {
    url: "https://guide.michelin.com/en/article/dining-out/lyon-bouchon-guide-authentic",
    note: "lyon bouchons are what i keep referencing when people ask me about traditional french food. daniel et denise is the benchmark — been twice",
    scrapedTitle: "Lyon's Bouchon Culture: The Authentic Michelin Guide",
    description: "Lyon's bouchons are the last living example of Lyonnaise grandmother cooking — quenelles, andouillette, tête de veau at Daniel et Denise (three locations, all correct).",
    placeName: "Lyon", countryCode: "FR", lat: 45.75, lng: 4.83,
    tags: ["France", "Lyon", "traditional", "bouchon", "fine dining"], category: "restaurant",
  },
  {
    url: "https://www.cntraveler.com/story/where-to-eat-in-lima-peru",
    note: "central is the main reason peru keeps coming up in my head. maido and kjolle are the supporting cast. three proper restaurants in one city that could justify the whole flight",
    scrapedTitle: "Where to Eat in Lima, Peru Right Now",
    description: "Lima's top three — Central (ecosystems tasting menu), Maido (nikkei omakase), and Kjolle (Mater Iniciativa seasonal) — represent the three strongest restaurants in the hemisphere.",
    placeName: "Lima", countryCode: "PE", lat: -12.04, lng: -77.03,
    tags: ["Peru", "Lima", "fine dining", "Central", "South America"], category: "restaurant",
  },
  {
    url: "https://www.thepurposefulnomad.com/goa-food-guide/",
    note: "the portuguese-goan crossover food is the thing i'm most interested in. bebinca, xacuti, the prawn curries. not the tourist beach shacks",
    scrapedTitle: "Goa Food Guide: What to Eat Beyond the Beach Shacks",
    description: "Goa's best food is Catholic-influenced and Portuguese-crossover — bebinca cake, prawn balchão, and feni-cured fish at old family restaurants in Panjim and Margao.",
    placeName: "Goa", countryCode: "IN", lat: 15.30, lng: 74.00,
    tags: ["India", "Goa", "Portuguese", "food", "seafood"], category: "restaurant",
  },
  {
    url: "https://www.timeout.com/istanbul/restaurants/best-restaurants-in-istanbul",
    note: "istanbul for a long weekend is starting to feel possible. the karaköy restaurant scene has exploded apparently. and good meze is always good meze",
    scrapedTitle: "The Best Restaurants in Istanbul Right Now",
    description: "Istanbul's Karaköy and Cihangir neighbourhoods now rival Copenhagen for ingredient-driven cooking — meyhane culture (long meze dinners with raki) remains uniquely the city's own.",
    placeName: "Istanbul", countryCode: "TR", lat: 41.01, lng: 28.97,
    tags: ["Turkey", "Istanbul", "meze", "fine dining", "city"], category: "restaurant",
  },
  {
    url: "https://www.eater.com/maps/hong-kong-dim-sum-guide-restaurants",
    note: "the tim ho wan thing has always seemed like a trap to me. the proper places in sham shui po are on this eater map and they're a fraction of the price",
    scrapedTitle: "Where to Eat Dim Sum in Hong Kong — The Serious Guide",
    description: "Hong Kong dim sum peaks at mid-range Cantonese spots in Sham Shui Po and Sheung Wan — Sun Hing, One Dim Sum, and Victoria City all beat the tourist circuit comprehensively.",
    placeName: "Hong Kong", countryCode: "HK", lat: 22.28, lng: 114.16,
    tags: ["Hong Kong", "dim sum", "Cantonese", "food", "city"], category: "restaurant",
  },
];

// ── Hardcoded travel profiles ──────────────────────────────────────────────────

const TRAVEL_PROFILES: Record<string, string> = {
  demo_elena:
    "Slow wanderer anchored by food markets and fermented things. Gravitates toward Southern Europe and Mexico in 3–4 week stretches. Rents a room over a hotel and builds a local routine within days — a market, a bar, a walking circuit. Makes decisions based on seasonal produce and neighbourhood density, not highlights. Avoids anywhere that's been fully discovered.",
  demo_james:
    "Extreme terrain chaser with limited patience for infrastructure. Goes where roads end or require permits. Plans in 10–20 day blocks for full wilderness immersion. Allocates budget to permits, guides, and helicopter access — not accommodation. Off-season is the point. Has been to every continent and still has a list.",
  demo_nina:
    "High-density city break specialist. 5–7 days, one neighbourhood per city, galleries every morning, serious dinner every night. Researches restaurant lists for weeks in advance. Leaves knowing the neighbourhood better than the highlights. Cities are the destination, not the base.",
  demo_marco:
    "Digital nomad with a surf schedule. Plans location decisions around swell season, coworking wifi, and cost of living. Moves every 4–8 weeks. Treats accommodation as base camp and needs a morning in the water before he can do anything useful at a desk. Has been working remotely for 6 years and has an opinion about every coworking space in Lisbon.",
  demo_priya:
    "Serious culinary traveler. Plans trips around 2–3 headline restaurant reservations and fills the rest with market visits and neighbourhood exploration. Keeps a running list of Michelin constellations she hasn't covered yet. Equally at home in a €80 kaiseki lunch and a €3 street taco — what matters is that it's the real thing.",
};

type ProfileSaves = {
  userId: string;
  saves: SaveInput[];
  questions: string[];
};

const PROFILES: ProfileSaves[] = [
  {
    userId: "demo_elena",
    saves: ELENA_SAVES,
    questions: [
      "I have January free and want 3–4 weeks somewhere slow. Should I go back to Lisbon or finally try Thessaloniki?",
      "November week — Norcia for truffles or Valletta for something easier? I've been moving fast lately and want to slow down.",
    ],
  },
  {
    userId: "demo_james",
    saves: JAMES_SAVES,
    questions: [
      "August, three weeks, I want real wilderness with minimal infrastructure. Svalbard or Kyrgyzstan?",
      "I want to do a high-altitude Central Asia trip — structure 3 weeks between Kyrgyzstan and a side trip to Ladakh.",
    ],
  },
  {
    userId: "demo_nina",
    saves: NINA_SAVES,
    questions: [
      "I have 5 days each in Tokyo and Seoul — which city do I go deeper on for art and food, and which do I treat as a stopover?",
      "Spring week in Europe. Paris or Berlin for the galleries and restaurant scene?",
    ],
  },
  {
    userId: "demo_marco",
    saves: MARCO_SAVES,
    questions: [
      "Six weeks free from November. I need to work remotely and surf every morning. Lisbon or Las Palmas de Gran Canaria?",
      "Ten days between projects. Bali or Chiang Mai for a proper reset — somewhere I can surf and actually get work done?",
    ],
  },
  {
    userId: "demo_priya",
    saves: PRIYA_SAVES,
    questions: [
      "Two weeks in Japan to eat seriously — build me a food itinerary from Tokyo to Osaka.",
      "Spain or Peru for a culinary trip? I've already done Japan and done France. Which one has more to offer right now?",
    ],
  },
];

// ── Demo trip data (hardcoded, no AI needed) ───────────────────────────────────

type GroupDecisionInput = {
  question: string;
  status: "done" | "assigned" | "undecided";
  assignedTo: string | null;
  costPerPax: string | null;
  confirmationLink: string | null;
  verdictJson: ReturnType<typeof groupVerdictJsonSchema.parse> | null;
  comments: { userId: string; displayName: string; content: string }[];
};

type TripInput = {
  inviteToken: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  coordinatorId: string;
  overviewNotes: string;
  members: { userId: string; role: "coordinator" | "member"; displayName: string }[];
  decisions: GroupDecisionInput[];
};

const DEMO_TRIPS: TripInput[] = [
  // ── Trip 1: Mediterranean September ─────────────────────────────────────────
  {
    inviteToken: "demo-trip-public",
    name: "Mediterranean September",
    destination: "Southern Italy + Sicily",
    startDate: "2025-09-01",
    endDate: "2025-09-14",
    coordinatorId: "demo_elena",
    overviewNotes: `## Flights
- Elena: Bari → Catania Sept 10 (Ryanair, €45, booked ✓)
- James: Athens → Catania Sept 10 (Aegean, €120, booked ✓)
- Nina: Athens → Catania Sept 10 (same flight as James ✓)
- All out: Palermo → home Sept 14

## Accommodation booked
- Elena: Masseria near Lecce Sept 1–9 (confirmed, €420 total ✓)
- James + Nina Athens: Exarchia hostel Sept 1–3, Meteora guesthouse Sept 4–5 (booked ✓)

## Group logistics
- Syracuse reunion: Saturday 10th, Ortigia market 7am — nobody is late
- Shared WhatsApp group created ✓
- James driving rental from Taormina — picking up Nina at Catania airport 2pm

## Still to do
- Book Palermo accommodation (Nina on this)
- Ragusa Ibla hotel for Nina, 2 nights
- Etna guided ascent for James — check availability
- Noto granita breakfast before the flight home`,
    members: [
      { userId: "demo_elena", role: "coordinator", displayName: "Elena Vasquez" },
      { userId: "demo_james", role: "member", displayName: "James Okoro" },
      { userId: "demo_nina", role: "member", displayName: "Nina Chen" },
    ],
    decisions: [
      {
        question: "Week one — should we split up or stay together? Everyone has different priorities.",
        status: "done",
        assignedTo: "demo_elena",
        costPerPax: "€420",
        confirmationLink: "https://airbnb.com",
        verdictJson: groupVerdictJsonSchema.parse({
          type: "structure",
          verdict: "Split to your strengths. Converge in Sicily on day 10.",
          travelPatterns: [
            "Elena roots in food-driven neighbourhoods and needs 5+ days to find her rhythm",
            "James optimises for physical terrain — cities are layovers",
            "Nina extracts maximum cultural density in short windows and moves fast",
          ],
          coreConflict: "Elena wants slow immersion, James wants altitude, Nina wants gallery density — same week, three incompatible modes",
          whatYoureMissing: "Forced group compromise means nobody gets what they came for. Splitting week one means you actually enjoy it.",
          whyThisFits: "Elena anchors in Puglia — masseria near Lecce, Slow Food towns, market circuit. James and Nina fly into Athens: two days at Meteora for James, Exarchia galleries and Monastiraki for Nina. All three land in Ortigia, Syracuse on day 10.",
          tradeoffs: "You lose the group dynamic for week one. Requires everyone to be confident with solo logistics for 9 days.",
          avoidIf: ["First trip abroad for anyone", "One person is anxious about solo travel", "Flights don't allow split routing"],
          nextMove: "Book the Lecce masseria now — it sells in September. Athens flights are flexible.",
          anchors: ["Lecce area, Puglia (Elena)", "Athens + Meteora (James/Nina, split)", "Ortigia, Syracuse (group reunion)"],
          timingConfidence: "High — September is ideal for all three legs",
          stopDoingThis: "Planning every day as a group when travel styles are fundamentally incompatible for week one",
          usedSaveIds: [],
          whoGetsWhat: [
            { userId: "demo_elena", memberName: "Elena", assignment: "7 nights near Lecce — masseria, Salento markets, Ostuni hill town day" },
            { userId: "demo_nina", memberName: "Nina", assignment: "Athens 4 nights — Exarchia galleries, Kerameikos evening, serious dinner" },
            { userId: "demo_james", memberName: "James", assignment: "Meteora 2 nights then Pelion coast — 8-hour ridge walk, isolated beach guesthouse" },
          ],
          theSeam: "All three in Ortigia market, Syracuse, Saturday morning of day 10. Market starts at 7am. Nobody is late.",
        }),
        comments: [
          { userId: "demo_james", displayName: "James", content: "I'm not spending a week in a city. If we're going southern Italy I need at least something with elevation or I'm doing a solo detour anyway." },
          { userId: "demo_nina", displayName: "Nina", content: "If James is going remote I'd genuinely rather have Athens to myself. I can get through three galleries before either of you have had breakfast." },
          { userId: "demo_elena", displayName: "Elena", content: "This is exactly why we should split. I'll coordinate the Sicily reunion. Book your own week one." },
        ],
      },
      {
        question: "Final 4 days — Sicily or Malta?",
        status: "assigned",
        assignedTo: "demo_nina",
        costPerPax: null,
        confirmationLink: null,
        verdictJson: groupVerdictJsonSchema.parse({
          type: "choose",
          verdict: "Sicily. Full stop.",
          travelPatterns: [
            "Elena's food logic requires cultural depth — Malta can't compete with Palermo's street food density",
            "Nina needs walkable city blocks with serious architecture and at least one gallery — Ragusa Ibla delivers",
            "James needs one physical challenge — Etna summit is the obvious answer and he knows it",
          ],
          coreConflict: "Malta is the easier, more predictable choice — which is exactly why it's wrong for this group",
          whatYoureMissing: "Malta is compact and lovely but thin on food culture and has almost no contemporary art scene. You'd eat in tourist restaurants and feel restless.",
          whyThisFits: "Sicily has enough geographic range to give everyone their mode without compromise — baroque cities, volcanic terrain, and one of the best food regions in Europe all in four days.",
          tradeoffs: "Why not Malta: better weather guarantee, simpler logistics, less distance. But the wrong energy for how this trip has gone.",
          avoidIf: ["Someone has mobility issues (Etna is a full-day hike)", "You have fewer than 3 days", "It's July or August (too hot)"],
          nextMove: "Book Palermo accommodation now. Ragusa Ibla fills fast in September.",
          anchors: ["Palermo (Elena base)", "Ragusa Ibla (Nina, 2 nights)", "Nicolosi / Etna (James detour)"],
          timingConfidence: "High — September is the best month in Sicily. Harvest season, no crowds.",
          stopDoingThis: "Treating Malta as a reasonable alternative. It isn't for this trip.",
          usedSaveIds: [],
          whoGetsWhat: [
            { userId: "demo_elena", memberName: "Elena", assignment: "Palermo — Ballarò and Vucciria markets, day trip to Marsala wine cantinas" },
            { userId: "demo_nina", memberName: "Nina", assignment: "Ragusa Ibla 2 nights — baroque UNESCO walk, dinner at one serious restaurant" },
            { userId: "demo_james", memberName: "James", assignment: "Etna summit via crater rim trail — 6-hour guided ascent, overnight in Nicolosi" },
          ],
          theSeam: "Noto almond granita at 8am before the flight home. Everyone makes it. Nobody is still in bed.",
        }),
        comments: [
          { userId: "demo_nina", displayName: "Nina", content: "Malta feels like the sensible choice. Smaller, easier, everyone ends up in the same place." },
          { userId: "demo_james", displayName: "James", content: "Nina I respect you but I'm not flying to the Mediterranean and skipping Etna. It's a volcano. I have standards." },
          { userId: "demo_elena", displayName: "Elena", content: "Sicily. Malta is a different trip. The Ballarò market alone justifies it." },
        ],
      },
      {
        question: "That half-day in Catania when the split ends and before we move to Syracuse — what's the plan?",
        status: "undecided",
        assignedTo: null,
        costPerPax: null,
        confirmationLink: null,
        verdictJson: null,
        comments: [
          { userId: "demo_james", displayName: "James", content: "Are we all arriving from different cities? I'm coming down from Taormina by rental car." },
          { userId: "demo_nina", displayName: "Nina", content: "I'm on the Athens → Catania flight, arriving 2pm. Can someone meet me or is everyone fending for themselves?" },
          { userId: "demo_elena", displayName: "Elena", content: "Train from Lecce, arrives 11am. I want to walk the fish market before you two land. James — could you pick Nina up if you're driving?" },
          { userId: "demo_james", displayName: "James", content: "Yes. I'll swing by the airport on the way south. Nina just send me your flight number." },
        ],
      },
    ],
  },

  // ── Trip 2: Lisbon Working Week ───────────────────────────────────────────────
  {
    inviteToken: "demo-lisbon-work",
    name: "Lisbon Working Week",
    destination: "Lisbon, Portugal",
    startDate: "2026-02-01",
    endDate: "2026-02-07",
    coordinatorId: "demo_marco",
    overviewNotes: `## Flights
- Marco: London → Lisbon Feb 1 (TAP TP1309, 07:15, booked ✓)
- Marco return: Lisbon → London Feb 7 (TAP TP1308, 21:30, booked ✓)
- Elena arriving by train from Porto Feb 2, departing Feb 7

## Accommodation
- Marco: Airbnb near Mouraria, 6 nights (confirmed ✓ — €85/night)
- Elena: her regular apartment near Intendente (sorted, same landlord as last time)

## Coworking options researched
- Outsite Lisbon rooftop — €25/day, gigabit wifi, Príncipe Real, book ahead
- Second Home Ribeira — €20/day, beautiful space, occasional events
- Coral Coworking — €15/day, Mouraria, quieter and local
- LXFactory cafes — free with purchase, less reliable wifi but good atmosphere

## Food plan
- Market mornings: Intendente Sunday market, Mercado de Campo de Ourique Saturday
- Shared dinners: Mouraria area — Za'atar, Taberna da Rua das Flores, Tasca do Chico
- Coffee: Nicolau (Intendente), Hello Kristof (Príncipe Real), Fábrica (Chiado)
- One proper dinner together somewhere serious — TBD

## Still to do
- Friday night dinner — need a verdict (see decision room)
- Confirm coworking for the week — Marco booking Outsite, Elena usually works from home
- Who's bringing the olive oil (Elena has a source near Intendente market)`,
    members: [
      { userId: "demo_marco", role: "coordinator", displayName: "Marco Silva" },
      { userId: "demo_elena", role: "member", displayName: "Elena Vasquez" },
    ],
    decisions: [
      {
        question: "Should we anchor the full week in Lisbon or add a 2-night detour to Sintra or the Setúbal coast?",
        status: "done",
        assignedTo: "demo_marco",
        costPerPax: null,
        confirmationLink: null,
        verdictJson: groupVerdictJsonSchema.parse({
          type: "choose",
          verdict: "Lisbon base. Day trips only.",
          travelPatterns: [
            "Marco needs reliable coworking infrastructure — remote locations mean backup hotspot stress",
            "Elena builds neighbourhood routines that take 3+ days to settle into",
            "Both have saved Lisbon specifically for the density of the neighbourhood experience, not the countryside",
          ],
          coreConflict: "Sintra and Setúbal are beautiful but they require a car, interrupt the coworking rhythm, and neither of you actually has either saved",
          whatYoureMissing: "The Sintra palace circuit takes half a day and produces photos. You have seven days — spending two of them on a detour means you never settle.",
          whyThisFits: "Lisbon with a Sintra day trip on a non-work morning gives you the palaces without breaking the week's rhythm. Same for Arrábida beach — an hour by car from Setúbal.",
          tradeoffs: "You give up the feeling of 'seeing the countryside'. But neither of your saves suggest that's what you came for.",
          avoidIf: ["You've already done Lisbon multiple times", "Someone needs a complete break from city noise", "It's a summer visit — Arrábida is worth the detour in heat"],
          nextMove: "Lock Outsite coworking for Mon–Fri now. Wednesday morning can be Sintra if the forecast is clear.",
          anchors: ["Mouraria / Intendente (base and evenings)", "Príncipe Real (coworking and coffee)", "Sintra day trip (mid-week)"],
          timingConfidence: "High — February Lisbon is uncrowded and mild. Market season is good.",
          stopDoingThis: "Adding detours to a working week. The work doesn't pause and then nothing gets done properly.",
          usedSaveIds: [],
          whoGetsWhat: [
            { userId: "demo_marco", memberName: "Marco", assignment: "Outsite Lisbon coworking Mon–Fri, surf day at Ericeira or Peniche one morning" },
            { userId: "demo_elena", memberName: "Elena", assignment: "Intendente apartment base, market mornings, afternoon neighbourhood walks" },
          ],
          theSeam: "Mercado de Campo de Ourique Saturday morning — then the flight home after lunch.",
        }),
        comments: [
          { userId: "demo_elena", displayName: "Elena", content: "I've been to Sintra twice. It's always crowded and always the same. I'd rather spend the time walking Alfama properly." },
          { userId: "demo_marco", displayName: "Marco", content: "Agreed. I could do a surf morning at Ericeira mid-week without disrupting anything. That's the only detour I actually need." },
        ],
      },
      {
        question: "Which neighbourhood for shared dinners — Mouraria or Príncipe Real?",
        status: "assigned",
        assignedTo: "demo_elena",
        costPerPax: null,
        confirmationLink: null,
        verdictJson: groupVerdictJsonSchema.parse({
          type: "choose",
          verdict: "Mouraria. Every night.",
          travelPatterns: [
            "Elena has saved Mouraria-adjacent tascas specifically — this is what she came for",
            "Marco's coworking is in Príncipe Real but his accommodation is in Mouraria — he walks home",
            "Both have food saves that skew local, tasco-style, cheap and good rather than destination dining",
          ],
          coreConflict: "Príncipe Real is more polished but it's the kind of neighbourhood you visit, not the one you eat in every night",
          whatYoureMissing: "Príncipe Real has one or two good restaurants and a very nice garden. Mouraria has six good places within a three-minute walk of Marco's Airbnb.",
          whyThisFits: "Tasca do Chico is a ten-minute walk from the apartment. Za'atar is on the corner. Bar da Mouraria for after. This is the neighbourhood for the week.",
          tradeoffs: "Why not Príncipe Real: better cocktail bars, slightly more design-forward spots. But you'd be walking 20 minutes back to base after every dinner.",
          avoidIf: ["You want a high-end wine list", "You're doing this in tourist season when Mouraria gets crowded", "Tasca do Chico is closed — check the calendar"],
          nextMove: "Book Tasca do Chico for Tuesday and Thursday evening now. They take reservations and fill up even in February.",
          anchors: ["Mouraria (tascas and petiscos)", "Intendente square (market and coffee)", "Alfama slope (evening walk circuit)"],
          timingConfidence: "High — February is exactly the right time. No queues, locals dominate.",
          stopDoingThis: "Defaulting to the 'nicer' neighbourhood when your accommodation, saves, and rhythm all point elsewhere.",
          usedSaveIds: [],
          whoGetsWhat: [
            { userId: "demo_marco", memberName: "Marco", assignment: "Book Tasca do Chico Tue + Thu, organise Za'atar for the first evening" },
            { userId: "demo_elena", memberName: "Elena", assignment: "Source the good olive oil at Intendente market, bring it to every dinner" },
          ],
          theSeam: "Fado at Tasca do Chico Thursday night. Arrive at 7pm or you won't get a table even with a booking.",
        }),
        comments: [
          { userId: "demo_marco", displayName: "Marco", content: "I'm literally walking past Za'atar every day on the way to the coworking. This is a non-question." },
          { userId: "demo_elena", displayName: "Elena", content: "I'll sort the reservations. You sort the wine. Tasca do Chico on a Thursday is the plan." },
        ],
      },
      {
        question: "Friday night — the new natural wine bar near Cais do Sodré or the old-school tasca in Alfama that Elena knows?",
        status: "undecided",
        assignedTo: null,
        costPerPax: null,
        confirmationLink: null,
        verdictJson: null,
        comments: [
          { userId: "demo_elena", displayName: "Elena", content: "The tasca in Alfama is called Tasca do Simão. Hidden courtyard, the owner knows my name at this point. Best bacalhau in the city. But it's a trek from Mouraria." },
          { userId: "demo_marco", displayName: "Marco", content: "How far is far? If we're walking, the natural wine bar is actually closer to the coworking and I'm finishing late on Friday." },
          { userId: "demo_elena", displayName: "Elena", content: "20 minutes on foot. Or 10 in a taxi. The question is whether we want a proper last dinner or something more casual." },
          { userId: "demo_marco", displayName: "Marco", content: "I vote tasca. We've been casual all week. Friday should be the good one." },
        ],
      },
    ],
  },

  // ── Trip 3: Japan Food Circuit ────────────────────────────────────────────────
  {
    inviteToken: "demo-japan-food",
    name: "Japan Food Circuit",
    destination: "Tokyo + Kyoto + Osaka",
    startDate: "2026-10-10",
    endDate: "2026-10-20",
    coordinatorId: "demo_nina",
    overviewNotes: `## Flights
- Nina + Priya: London Heathrow → Tokyo Narita Oct 10 (JAL JL401, 13:00, booked ✓)
- Return: Osaka Kansai → London Oct 20 (JAL JL404, 11:30, booked ✓)
- JR Pass: 14-day Green Car, purchased online ✓ (activate at Narita on arrival)

## Accommodation
- Tokyo: Trunk Hotel, Shibuya — 4 nights Oct 10–14 (confirmed ✓, ¥35,000/night)
- Kyoto: Ryokan in Gion — 3 nights Oct 14–17 (confirmed ✓, ¥28,000/night, yukata provided)
- Osaka: boutique hotel near Namba — 3 nights Oct 17–20 (TBC — Nina on this)

## Restaurant reservations — serious ones need booking 2–3 months ahead
- Night 3 Tokyo: Florilège, Aoyama — reservation confirmed ✓ (19:30, counter seats)
- Night 6 Kyoto: kaiseki dinner — Priya handling, URGENT (see decision room)
- Night 9 Osaka: Hajime (2 Michelin stars) — reservation pending, called twice

## Market and food research
- Tsukiji outer market: open from 5am, best on weekdays — tuna auction requires 2-month advance lottery
- Nishiki Market, Kyoto: go before 10am, closed Wednesdays, avoid weekends
- Kuromon Market, Osaka: morning only, best for crab and uni in October
- Dotonbori: evening street food, takoyaki benchmark at Wanaka

## Still to do
- Osaka hotel to confirm (Nina)
- Kyoto kaiseki reservation — urgent (see decision room)
- Nara / Fushimi Inari question — open (see decision room)
- Pre-book teamLab Borderless Tokyo tickets — sells out weeks ahead`,
    members: [
      { userId: "demo_nina", role: "coordinator", displayName: "Nina Chen" },
      { userId: "demo_priya", role: "member", displayName: "Priya Sharma" },
    ],
    decisions: [
      {
        question: "Tokyo → Kyoto → Osaka sequence, or flip it and start in Osaka to end in Tokyo?",
        status: "done",
        assignedTo: "demo_nina",
        costPerPax: null,
        confirmationLink: null,
        verdictJson: groupVerdictJsonSchema.parse({
          type: "structure",
          verdict: "Tokyo first. End in Osaka. The reverse is wrong.",
          travelPatterns: [
            "Nina needs the gallery density of Tokyo to calibrate the trip before slowing down in Kyoto",
            "Priya's kaiseki research is Kyoto-anchored — it makes sense as the centrepiece, not the opening",
            "Osaka at the end is correct because it's the most food-casual city — right energy for a final few days",
          ],
          coreConflict: "Osaka-first logic breaks the narrative arc — you'd peak on street food, then spend ten days moving toward something more formal",
          whatYoureMissing: "Osaka to Tokyo reads as anti-climactic. Tokyo has the most sensory intensity — start there when you have the energy for it.",
          whyThisFits: "Tokyo 4 nights to calibrate and recover from the flight. Nozomi shinkansen to Kyoto — ryokan and kaiseki and Nishiki. Osaka 3 nights for street food and Dotonbori decompression before the flight home.",
          tradeoffs: "Luggage moves three times. The Kyoto ryokan check-in time is strict — plan the Nozomi timing carefully.",
          avoidIf: ["You have a reservation in Osaka on night 1 that you can't move", "Trunk Hotel is sold out — then swap to Osaka"],
          nextMove: "Book the Nozomi Shinkansen Tokyo → Kyoto for Oct 14 morning. Reserve online — reserved seats only on this service.",
          anchors: ["Shibuya / Shimokitazawa (Tokyo, Nina's neighbourhood)", "Gion / Nishiki (Kyoto, ryokan base)", "Namba / Dotonbori (Osaka, final days)"],
          timingConfidence: "High — October is peak autumn season. Book everything now.",
          stopDoingThis: "Second-guessing the sequence. The standard Tokyo → Kyoto → Osaka arc exists because it works.",
          usedSaveIds: [],
          whoGetsWhat: [
            { userId: "demo_nina", memberName: "Nina", assignment: "Tokyo: Shimokitazawa first two evenings, teamLab Borderless day 2, Florilège night 3" },
            { userId: "demo_priya", memberName: "Priya", assignment: "Tokyo: Tsukiji breakfast daily, Ginza exploration, research Florilège menu in advance" },
          ],
          theSeam: "Nozomi 700E on the morning of Oct 14. Kyoto arrival 10:30am, Nishiki Market before ryokan check-in at 3pm.",
        }),
        comments: [
          { userId: "demo_priya", displayName: "Priya", content: "I was originally thinking Osaka first because the kaiseki research I've done is all Kyoto — I wanted to build toward it." },
          { userId: "demo_nina", displayName: "Nina", content: "That's exactly right. Tokyo sets up Kyoto. Osaka is the come-down. The reverse kills the rhythm." },
          { userId: "demo_priya", displayName: "Priya", content: "Agreed. I'll book the shinkansen. You sort the teamLab tickets — I hear they sell out." },
        ],
      },
      {
        question: "Kyoto night two: full kaiseki course or the izakaya circuit in Gion?",
        status: "done",
        assignedTo: "demo_priya",
        costPerPax: "¥22,000",
        confirmationLink: null,
        verdictJson: groupVerdictJsonSchema.parse({
          type: "choose",
          verdict: "Kaiseki. Book it today.",
          travelPatterns: [
            "Priya plans trips around 2–3 headline restaurant reservations — kaiseki is the reason Kyoto is on the itinerary",
            "Nina has the cultural calibration for formal dining — she won't be uncomfortable in a tatami room",
            "The izakaya circuit is available any evening — kaiseki requires booking 2 months ahead",
          ],
          coreConflict: "The izakaya circuit is good but it's replicable — kaiseki in Kyoto in October at a serious kitchen is not",
          whatYoureMissing: "If you do izakaya on night two and try to book kaiseki later, you'll find it's gone. The best rooms book out weeks ahead.",
          whyThisFits: "October in Kyoto is peak autumn — the kaiseki menu will feature matsutake mushrooms, sudachi citrus, and whatever's at perfect ripeness that week. This is the best time to do it.",
          tradeoffs: "Why not izakaya: more relaxed, more variety, cheaper, no dress code. Better for the last night in Osaka when the mood is casual.",
          avoidIf: ["Someone is uncomfortable with 2.5 hour seated formal dining", "You've already done kaiseki in Tokyo", "Budget has changed since booking"],
          nextMove: "Call Kichisen or Nakamura today — October books out by August. If full, try Mizai or Kikunoi Honten.",
          anchors: ["Gion (ryokan and kaiseki district)", "Nishiki Market (morning, pre-kaiseki)", "Philosopher's Path (afternoon walk to reset before dinner)"],
          timingConfidence: "High — this is the right call. The only risk is not booking in time.",
          stopDoingThis: "Treating izakaya as a comparable alternative to kaiseki. They are different experiences serving different purposes.",
          usedSaveIds: [],
          whoGetsWhat: [
            { userId: "demo_nina", memberName: "Nina", assignment: "Handle the reservation logistics, dress code research, confirm dietary requirements with the restaurant" },
            { userId: "demo_priya", memberName: "Priya", assignment: "Research the seasonal menu, brief Nina on the kaiseki course structure before arrival" },
          ],
          theSeam: "Arrive at the restaurant in yukata from the ryokan if allowed — it's 10 minutes on foot. Dinner at 7pm means a full afternoon free for Nishiki.",
        }),
        comments: [
          { userId: "demo_nina", displayName: "Nina", content: "I want to do the izakaya thing because it feels more real than a formal course. But I also know this is exactly when I'll regret being practical." },
          { userId: "demo_priya", displayName: "Priya", content: "Nina. We are in Kyoto in October at a ryokan in Gion. If not now, when. I'm booking kaiseki." },
          { userId: "demo_nina", displayName: "Nina", content: "Fine. Yes. You're right. Book it. Can we do izakaya the other night?" },
          { userId: "demo_priya", displayName: "Priya", content: "Yes. Gion Nanba for night one. Kaiseki for night two. Perfect." },
        ],
      },
      {
        question: "We have an extra half-day between Kyoto and Osaka — Nara detour for the deer park, or stay in Kyoto for Fushimi Inari at dawn?",
        status: "undecided",
        assignedTo: null,
        costPerPax: null,
        confirmationLink: null,
        verdictJson: null,
        comments: [
          { userId: "demo_nina", displayName: "Nina", content: "Fushimi Inari at dawn is one of the most photographed things in Japan, which is exactly why I'm suspicious of it. Is it actually better at 5am or is that just what everyone says?" },
          { userId: "demo_priya", displayName: "Priya", content: "I checked — the approach path has thousands of torii gates and yes it's genuinely less crowded before 7am. The deer park at Nara is lovely but it's a 45-min train and you're spending 2 hours with deer." },
          { userId: "demo_nina", displayName: "Nina", content: "Put it that way and Fushimi Inari wins. But I also don't want to wake up at 4:30am on day 7." },
          { userId: "demo_priya", displayName: "Priya", content: "We ask the ryokan for an early breakfast box. 5:15am departure. Back by 8am for a proper morning. Then the Nozomi to Osaka." },
        ],
      },
    ],
  },
];

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Seeding demo profiles...\n");

  const savedSaveIdsByUser: Record<string, number[]> = {};

  for (const profile of PROFILES) {
    console.log(`\n── ${profile.userId} ──`);

    // Clear existing solo data
    const existingSaves = await db.select().from(savesTable).where(eq(savesTable.userId, profile.userId));
    if (existingSaves.length > 0) {
      await db.delete(decisionsTable).where(eq(decisionsTable.userId, profile.userId));
      await db.delete(savesTable).where(eq(savesTable.userId, profile.userId));
      console.log("  Cleared existing solo data");
    }

    // Insert saves
    const insertedSaves: typeof savesTable.$inferSelect[] = [];
    for (const save of profile.saves) {
      const [inserted] = await db.insert(savesTable).values({
        userId: profile.userId,
        note: save.note,
        url: save.url,
        scrapedTitle: save.scrapedTitle,
        description: save.description,
        placeName: save.placeName,
        countryCode: save.countryCode,
        lat: save.lat,
        lng: save.lng,
        tags: JSON.stringify(save.tags),
        category: save.category,
      }).returning();
      insertedSaves.push(inserted);
    }
    savedSaveIdsByUser[profile.userId] = insertedSaves.map(s => s.id);
    console.log(`  Inserted ${insertedSaves.length} saves`);

    // Generate decisions
    for (const question of profile.questions) {
      console.log(`  Generating decision: "${question.slice(0, 60)}..."`);
      try {
        const { rawContent, resultJson, savesSnapshot } = await generateDecision(question, insertedSaves);
        await db.insert(decisionsTable).values({
          userId: profile.userId,
          question,
          result: rawContent,
          resultJson,
          savesSnapshot,
        });
        console.log(`  ✓ Verdict: "${resultJson.verdict}"`);
      } catch (err) {
        console.error("  ✗ Failed:", err);
      }
    }

    // Upsert travel profile
    await db
      .insert(userProfilesTable)
      .values({
        userId: profile.userId,
        travelProfile: TRAVEL_PROFILES[profile.userId] ?? "",
        savesCount: profile.saves.length,
      })
      .onConflictDoUpdate({
        target: userProfilesTable.userId,
        set: {
          travelProfile: TRAVEL_PROFILES[profile.userId] ?? "",
          savesCount: profile.saves.length,
          updatedAt: new Date(),
        },
      });
    console.log("  ✓ Travel profile upserted");
  }

  // ── Demo trips ─────────────────────────────────────────────────────────────
  for (const tripData of DEMO_TRIPS) {
    console.log(`\n── ${tripData.name} ──`);

    // Clear existing
    const existingTrips = await db
      .select()
      .from(tripsTable)
      .where(eq(tripsTable.inviteToken, tripData.inviteToken));
    for (const trip of existingTrips) {
      await db.delete(tripsTable).where(eq(tripsTable.id, trip.id));
      console.log(`  Cleared existing trip (id ${trip.id})`);
    }

    // Create trip
    const [trip] = await db.insert(tripsTable).values({
      name: tripData.name,
      destination: tripData.destination,
      startDate: tripData.startDate,
      endDate: tripData.endDate,
      coordinatorId: tripData.coordinatorId,
      inviteToken: tripData.inviteToken,
    }).returning();
    console.log(`  Created trip id ${trip.id}`);

    // Add overview notes
    await db.insert(tripOverviewNotesTable).values({
      tripId: trip.id,
      content: tripData.overviewNotes,
    }).onConflictDoUpdate({
      target: tripOverviewNotesTable.tripId,
      set: { content: tripData.overviewNotes, updatedAt: new Date() },
    });
    console.log(`  ✓ Overview notes added`);

    // Add members
    await db.insert(tripMembersTable).values(
      tripData.members.map(m => ({
        tripId: trip.id,
        userId: m.userId,
        role: m.role,
        displayName: m.displayName,
      }))
    );
    console.log(`  Added ${tripData.members.length} members`);

    // Create group decisions
    for (const dec of tripData.decisions) {
      const [inserted] = await db.insert(groupDecisionsTable).values({
        tripId: trip.id,
        question: dec.question,
        status: dec.status,
        verdictJson: dec.verdictJson ?? null,
        assignedTo: dec.assignedTo,
        costPerPax: dec.costPerPax,
        confirmationLink: dec.confirmationLink,
        createdBy: tripData.coordinatorId,
      }).returning();

      for (const comment of dec.comments) {
        await db.insert(decisionCommentsTable).values({
          decisionId: inserted.id,
          userId: comment.userId,
          displayName: comment.displayName,
          content: comment.content,
        });
      }
      console.log(`  ✓ Decision "${dec.question.slice(0, 50)}…" (${dec.status})`);
    }
  }

  // ── Friend sharing ─────────────────────────────────────────────────────────
  console.log("\n── Friend sharing ──");

  // Clear all demo friend shares
  for (const userId of DEMO_USER_IDS) {
    await db.delete(saveShareRequestsTable).where(eq(saveShareRequestsTable.fromUserId, userId));
  }

  const friendPairs: { from: string; fromEmail: string; to: string; toEmail: string }[] = [
    { from: "demo_elena", fromEmail: "elena@demo.whereto.app", to: "demo_nina", toEmail: "nina@demo.whereto.app" },
    { from: "demo_nina", fromEmail: "nina@demo.whereto.app", to: "demo_elena", toEmail: "elena@demo.whereto.app" },
    { from: "demo_marco", fromEmail: "marco@demo.whereto.app", to: "demo_elena", toEmail: "elena@demo.whereto.app" },
    { from: "demo_elena", fromEmail: "elena@demo.whereto.app", to: "demo_marco", toEmail: "marco@demo.whereto.app" },
    { from: "demo_nina", fromEmail: "nina@demo.whereto.app", to: "demo_priya", toEmail: "priya@demo.whereto.app" },
    { from: "demo_priya", fromEmail: "priya@demo.whereto.app", to: "demo_nina", toEmail: "nina@demo.whereto.app" },
  ];

  for (const pair of friendPairs) {
    await db.insert(saveShareRequestsTable).values({
      fromUserId: pair.from,
      toEmail: pair.toEmail,
      toUserId: pair.to,
      status: "accepted",
    });
  }
  console.log("  ✓ Elena ↔ Nina friend share (accepted)");
  console.log("  ✓ Marco ↔ Elena friend share (accepted)");
  console.log("  ✓ Nina ↔ Priya friend share (accepted)");

  console.log("\nDone! Demo data seeded successfully.");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
