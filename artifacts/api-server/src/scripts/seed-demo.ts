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
  url: string;
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
    url: "https://www.reddit.com/r/solotravel/comments/18xkp2q/oaxaca_for_5_weeks_anyone_done_this/",
    content: "found this thread when i was researching a longer oaxaca stay. someone mentioned renting in jalatlaco neighborhood for $600/month and i can't stop thinking about it",
    scrapedTitle: "Oaxaca for 5 weeks — anyone done this? : r/solotravel",
    scrapedDescription: "Planning to stay in Oaxaca from mid-January through late February. Found a furnished room in Jalatlaco for $600/month. The mezcal bars in that neighborhood are apparently insane and the Mercado 20 de Noviembre in the morning is unlike anything else in Mexico...",
    placeName: "Oaxaca", countryCode: "MX", lat: 17.07, lng: -96.72,
    tags: ["slow travel", "food", "mezcal", "markets"], category: "destination",
  },
  {
    url: "https://www.theguardian.com/travel/2023/sep/04/puglia-italy-slow-travel-masseria-guide",
    content: "friend spent 3 weeks at a masseria near lecce last september. she said she never wanted to leave. need to check if they do longer stays",
    scrapedTitle: "Slow travel in Puglia: masserias, burrata and ancient olive groves",
    scrapedDescription: "The masseria — a fortified farmhouse turned agriturismo — is Puglia's great accommodation invention. Some have been in the same families for 400 years. The best ones are working farms: you eat what they grow, you follow the light. Best in September or October when the harvest starts...",
    placeName: "Puglia", countryCode: "IT", lat: 40.35, lng: 18.17,
    tags: ["Italy", "food", "slow travel", "masseria", "wine"], category: "destination",
  },
  {
    url: "https://www.instagram.com/p/C3mNxKVOrwI/",
    content: "bookmarked this for the porto wine caves. four hours of tastings for basically nothing?? that's the whole vibe right there",
    scrapedTitle: "The cellars under Vila Nova de Gaia are one of the great free afternoons in Europe 🍷",
    scrapedDescription: "Spent four hours tasting port wine in the caves below the city. Most cellars charge €5–10 and give you 2–3 pours. The Taylor Fladgate one has views over the Douro from the terrace. Definitely do this on a weekday — weekends get crowded...",
    placeName: "Porto", countryCode: "PT", lat: 41.15, lng: -8.61,
    tags: ["wine", "Portugal", "food", "walking"], category: "destination",
  },
  {
    url: "https://www.seriouseats.com/cretan-food-what-to-eat-in-crete-greece",
    content: "went down a rabbit hole about cretan food. the dakos thing sounds incredible. want to go in october when it's empty",
    scrapedTitle: "The Essential Guide to Cretan Food: What to Eat in Crete",
    scrapedDescription: "Cretan cuisine is one of the world's great undiscovered food cultures. The dakos salad — rusks softened with tomato and piled with local cheese — is deceptively simple and impossible to stop eating. The lamb with stamnagathi greens, the kalitsounia pastries at breakfast...",
    placeName: "Crete", countryCode: "GR", lat: 35.34, lng: 25.13,
    tags: ["Greece", "food", "islands", "slow travel", "affordable"], category: "destination",
  },
  {
    url: "https://www.reddit.com/r/portugal/comments/1c2qfk8/mouraria_vs_intendente_where_to_stay_in_lisbon/",
    content: "trying to figure out which lisbon neighbourhood to base in for a longer stay. the intendente market looks really good. need to check november pricing",
    scrapedTitle: "Mouraria vs Intendente — where to stay in Lisbon for 3+ weeks? : r/portugal",
    scrapedDescription: "Been debating this for months. Mouraria is more authentic but getting touristy fast — especially around the fado houses near the castle. Intendente has the Sunday market and feels more like the actual city. Both have furnished rooms under €900/month if you look on Uniplaces...",
    placeName: "Lisbon", countryCode: "PT", lat: 38.72, lng: -9.14,
    tags: ["Portugal", "fado", "food", "city", "walking"], category: "destination",
  },
  {
    url: "https://www.messynessychic.com/2023/10/fez-guide-medina-leather-tanneries/",
    content: "this blog post finally made me actually want to go to fez. the hammam recommendation near the andalusian mosque — saving that specifically",
    scrapedTitle: "The Only Fez Guide You Need (For People Who Hate Guides)",
    scrapedDescription: "Fez el-Bali has 9,000 alleyways and you will get lost. This is the correct outcome. The Chouara tannery is worth the leather shop harassment — go early, before the tour groups. The hammam on the side street near the Andalusian mosque charges 15 dirhams and is where locals actually go...",
    placeName: "Fez", countryCode: "MA", lat: 34.03, lng: -5.00,
    tags: ["Morocco", "medina", "food", "craft", "hammam"], category: "destination",
  },
  {
    url: "https://www.bonappetit.com/story/umbria-italy-truffle-hunting-norcia",
    content: "norcia in november. truffle market on saturdays. literally no one else is there. this is exactly the kind of thing i'm always trying to find",
    scrapedTitle: "In Umbria, Truffle Season Is the Whole Point",
    scrapedDescription: "Norcia in November is the epicenter of the black truffle world, and the norcini butchers have been curing meat in these mountains for centuries. The Saturday morning truffle market by the basilica runs from 8am. You can buy half a kilo for what it would cost as a shaving at a London restaurant...",
    placeName: "Umbria", countryCode: "IT", lat: 42.79, lng: 13.10,
    tags: ["Italy", "truffle", "food", "off-season", "hill towns"], category: "destination",
  },
  {
    url: "https://www.reddit.com/r/solotravel/comments/1b4hkl9/thessaloniki_is_shockingly_good_and_nobody_talks/",
    content: "this is the kind of post i save and never act on. 10 days in thessaloniki with basically free food brought with every drink?? need to look at october flights",
    scrapedTitle: "Thessaloniki is shockingly good and nobody talks about it : r/solotravel",
    scrapedDescription: "Just got back from 10 days. The meze culture is incredible — you order a drink and they keep bringing small plates, no extra charge. The seafood at the fish tavernas on the waterfront is fresher than anything I've had in Athens. Rent is absurdly cheap...",
    placeName: "Thessaloniki", countryCode: "GR", lat: 40.64, lng: 22.94,
    tags: ["Greece", "food", "underrated", "meze", "affordable"], category: "destination",
  },
  {
    url: "https://www.lonelyplanet.com/articles/best-things-to-do-merida-mexico",
    content: "keeping this as an alternative to oaxaca. quieter, more affordable apparently, and the cenotes don't have influencers in them",
    scrapedTitle: "The best things to do in Mérida, Mexico's most underrated city",
    scrapedDescription: "Mérida is the capital of Yucatán and still mostly overlooked by international visitors. The Sunday market takes over the main square with hammock vendors and local food. Day trips to cenotes around Homún cost a fraction of what anything near Tulum charges...",
    placeName: "Mérida", countryCode: "MX", lat: 20.97, lng: -89.62,
    tags: ["Mexico", "Yucatan", "food", "cenotes", "affordable"], category: "destination",
  },
  {
    url: "https://www.theguardian.com/travel/2022/nov/12/valletta-malta-guide-european-capital-of-culture",
    content: "valletta for january? the size is appealing — walk everywhere, no decisions. need to actually check if the weather is decent in winter",
    scrapedTitle: "Valletta: the world's smallest capital, slow and extraordinary",
    scrapedDescription: "You can walk across Valletta in 20 minutes. The city has one of the world's great harbours, baroque churches on every corner, and a restaurant scene that punches well above its size. January is quiet and mild — maybe 16°C — with none of the summer crowds...",
    placeName: "Valletta", countryCode: "MT", lat: 35.90, lng: 14.51,
    tags: ["Malta", "history", "food", "harbor", "winter"], category: "destination",
  },
];

const JAMES_SAVES: SaveInput[] = [
  {
    url: "https://www.alltrails.com/trail/faroe-islands/streymoy/slaetaratindur-summit",
    content: "highest point in the faroes. looks totally manageable without a guide. want to do this in august when the puffins are still there",
    scrapedTitle: "Slaettaratindur Summit Trail — AllTrails",
    scrapedDescription: "The highest point in the Faroe Islands at 882m. Trail starts from Eiðisvatn lake and takes 3–4 hours round trip. Expect Atlantic weather and dramatic views over the North Atlantic. On weekdays in August you may not see another hiker. Puffin colonies visible from the ridge until late August...",
    placeName: "Faroe Islands", countryCode: "FO", lat: 61.89, lng: -6.91,
    tags: ["hiking", "remote", "Atlantic", "photography", "puffins"], category: "destination",
  },
  {
    url: "https://www.thebrokebackpacker.com/svalbard-travel-guide-without-cruise/",
    content: "svalbard without a cruise is actually doable. february polar night, snowmobile rentals out of longyearbyen. need to check costs",
    scrapedTitle: "How to Do Svalbard Without a Cruise Ship (A Practical Guide)",
    scrapedDescription: "Most people experience Svalbard on a cruise. You don't have to. Longyearbyen has guesthouses, you can rent snowmobiles in winter for around $150/day, and small-group snowshoeing into the backcountry exists for under $100. The polar night runs from October to February...",
    placeName: "Svalbard", countryCode: "NO", lat: 78.22, lng: 15.65,
    tags: ["Arctic", "polar", "remote", "snowmobile", "wildlife"], category: "destination",
  },
  {
    url: "https://www.reddit.com/r/solotravel/comments/1amqx6t/just_finished_the_w_circuit_torres_del_paine_ama/",
    content: "this ama convinced me. august off-season on the W circuit, 20 people over 5 days. that's exactly what i want",
    scrapedTitle: "Just finished the W Circuit — Torres del Paine. AMA : r/solotravel",
    scrapedDescription: "Did the circuit in August, which is off-season down there. Saw maybe 20 people total over 5 days on trail. The refugios had space and the wind was brutal but the trail is so good you don't care. Solo hiking is completely fine — the waymarking is excellent. Budget about $50/day all in...",
    placeName: "Patagonia", countryCode: "CL", lat: -51.03, lng: -73.00,
    tags: ["hiking", "Patagonia", "glaciers", "off-season", "solo"], category: "destination",
  },
  {
    url: "https://www.nationalgeographic.com/travel/article/namibia-sossusvlei-skeleton-coast-guide",
    content: "skeleton coast has been on my mind for 2 years. self-drive looks doable with the right 4wd. need to get there before it gets discovered",
    scrapedTitle: "The remote wonder of Namibia: dunes, desert, and the Skeleton Coast",
    scrapedDescription: "Sossusvlei's red dunes are the most photographed in Africa but still deliver — go at sunrise before the bus tours arrive. The Skeleton Coast is something else: bleaker, quieter, almost no infrastructure. The drive from Swakopmund to the Skeleton Coast Park takes a full day on gravel...",
    placeName: "Namibia", countryCode: "NA", lat: -24.73, lng: 15.34,
    tags: ["desert", "photography", "Africa", "self-drive", "remote"], category: "destination",
  },
  {
    url: "https://www.caravanistan.com/kyrgyzstan/song-kol-lake/",
    content: "song-kul in july. nomadic yurt stay, no signal, horses. this is the kind of place where you actually stop checking your phone",
    scrapedTitle: "Song-Kul Lake: Complete Guide to Kyrgyzstan's High-Altitude Lake",
    scrapedDescription: "Song-Kul sits at 3,016m and is only accessible June through September. You stay in yurts with nomadic families — meals included, horses available to hire. No phone signal, no electricity. The lake is surrounded by summer pasture and the sunrises over the Tian Shan are disorienting...",
    placeName: "Kyrgyzstan", countryCode: "KG", lat: 42.87, lng: 74.59,
    tags: ["Central Asia", "mountains", "nomadic", "yurt", "horses"], category: "destination",
  },
  {
    url: "https://www.lonelyplanet.com/articles/laugavegur-trail-guide",
    content: "want to do laugavegur in august. self-guided with hut bookings. been looking at f-road access for landmannalaugar approach",
    scrapedTitle: "The Laugavegur Trail: Iceland's most spectacular hike, fully explained",
    scrapedDescription: "55km through Iceland's highlands from Landmannalaugar to Þórsmörk. Rhyolite mountains, geothermal springs, obsidian fields, and snow crossings even in August. The mountain huts book out months in advance. Self-guided is fine if you're comfortable with river crossings...",
    placeName: "Iceland Highlands", countryCode: "IS", lat: 63.99, lng: -19.07,
    tags: ["Iceland", "hiking", "highlands", "photography", "huts"], category: "destination",
  },
  {
    url: "https://www.youtube.com/watch?v=4pPQ2jK0x5E",
    content: "watched this twice. the logistics section is really useful. thinking gobi + horse trek in the north. 3 weeks minimum",
    scrapedTitle: "30 Days Traveling Mongolia Alone — What Nobody Tells You",
    scrapedDescription: "A month in Mongolia without a guide or organized tour. The logistics are harder than people admit but completely manageable with some planning. Guesthouses in Ulaanbaatar can organize everything. The Gobi alone deserves 5 days. Budget roughly $30–40/day outside UB...",
    placeName: "Mongolia", countryCode: "MN", lat: 47.89, lng: 106.91,
    tags: ["Mongolia", "steppe", "nomadic", "Gobi", "horses"], category: "destination",
  },
  {
    url: "https://www.reddit.com/r/solotravel/comments/11nkw2p/kamchatka_solo_trip_report_what_i_wish_id_known/",
    content: "need to actually look at the permit situation for kamchatka. helicopter costs are real but the volcanic fields you can only reach that way look insane",
    scrapedTitle: "Kamchatka solo trip report — what I wish I'd known : r/solotravel",
    scrapedDescription: "Kamchatka is genuinely difficult. Most backcountry hiking requires a registered guide by law — you can skirt this but it's risky. Helicopter access to the remote volcanic fields runs $300–500 depending on group size. The Tolbachik lava fields are worth every ruble...",
    placeName: "Kamchatka", countryCode: "RU", lat: 53.01, lng: 158.65,
    tags: ["volcanoes", "Russia", "remote", "helicopter", "extreme"], category: "destination",
  },
  {
    url: "https://www.visitgreenland.com/inspiration/dog-sledding-in-greenland/",
    content: "february dog sledding out of sisimiut. looks genuinely different from svalbard — more remote, different culture. pricing seems reasonable",
    scrapedTitle: "Dog Sledding in Greenland — The Complete Experience Guide",
    scrapedDescription: "The best traditional dog sledding runs February through April when the sea ice is solid enough. Sisimiut is the main base — smaller than Ilulissat and less touristed. You travel with Greenlandic mushers, not tour operators. Multi-day trips go out on the ice sheet with overnight camps...",
    placeName: "Greenland", countryCode: "GL", lat: 69.22, lng: -51.10,
    tags: ["Arctic", "ice", "aurora", "dog sled", "culture"], category: "destination",
  },
  {
    url: "https://www.reddit.com/r/india/comments/1d9vf2m/solo_ladakh_trip_report_zanskar_valley_by_jeep/",
    content: "this trip report is exactly what i needed for ladakh. zanskar valley by jeep, monastery stays, pangong at the end. permits are complicated but doable solo",
    scrapedTitle: "Solo Ladakh trip report: Zanskar Valley by jeep [very detailed] : r/india",
    scrapedDescription: "Did the Zanskar Valley road in August — mostly unpaved, takes two full days from Kargil. The monastery guesthouses are $10–15 a night and the monks will feed you. Altitude hit me hard at Rangdum (3,800m). Pangong Tso at the end is worth the pain...",
    placeName: "Ladakh", countryCode: "IN", lat: 34.17, lng: 77.58,
    tags: ["India", "Himalayas", "altitude", "monasteries", "jeep"], category: "destination",
  },
  {
    url: "https://www.atlasobscura.com/articles/how-to-get-to-socotra-island",
    content: "logistics for socotra are genuinely painful. abu dhabi charter seems to be the main route now. been sitting on this for 6 months wondering if i'll actually pull the trigger",
    scrapedTitle: "The Complicated, Rewarding Quest to Reach the 'Galápagos of the Indian Ocean'",
    scrapedDescription: "Getting to Socotra requires either a charter flight from Abu Dhabi or catching the intermittent Yemenia flight from Cairo — when it runs. Travel insurance won't cover you. The dragon blood trees are unlike anything on earth. The beaches are empty. The permit process takes 2–3 weeks...",
    placeName: "Socotra", countryCode: "YE", lat: 12.46, lng: 54.01,
    tags: ["Yemen", "endemic", "islands", "remote", "rare"], category: "destination",
  },
];

const NINA_SAVES: SaveInput[] = [
  {
    url: "https://www.tokyocheapo.com/entertainment/shimokitazawa-guide/",
    content: "shimokitazawa keeps coming up every time i research tokyo. want to spend at least 2 days just in that neighbourhood. the basement live music venues",
    scrapedTitle: "Shimokitazawa: Tokyo's Coolest Neighbourhood (That's Actually Still Cool)",
    scrapedDescription: "Shimokitazawa is the neighbourhood that keeps resisting gentrification. Vintage shops, basement live music venues that charge ¥1,500 and keep going until 2am, curry restaurants run by people who genuinely care. The vibe is 1990s Tokyo indie scene that never fully died...",
    placeName: "Tokyo", countryCode: "JP", lat: 35.69, lng: 139.69,
    tags: ["Japan", "neighborhoods", "music", "vintage", "food"], category: "destination",
  },
  {
    url: "https://www.eater.com/22327801/ikseon-dong-seoul-guide-restaurants-bars",
    content: "ikseon-dong for the converted hanok bars. this eater piece convinced me seoul has something tokyo doesn't right now",
    scrapedTitle: "Ikseon-dong Is Seoul's Most Interesting Neighbourhood Right Now",
    scrapedDescription: "Ikseon-dong sits between the old Jongno district and the modern city — Korean hanok buildings converted into wine bars, omakase spots, and natural wine caves. The energy is different from Hongdae or Itaewon. More considered. The contrast between the architecture and what's inside is the whole thing...",
    placeName: "Seoul", countryCode: "KR", lat: 37.57, lng: 126.98,
    tags: ["Korea", "food", "bars", "design", "neighborhoods"], category: "destination",
  },
  {
    url: "https://www.theguardian.com/travel/2024/mar/18/copenhagen-food-guide-beyond-noma",
    content: "post-noma copenhagen food guide. geranium is out of budget but the vesterbro natural wine spots look really good. keeping this for an october long weekend",
    scrapedTitle: "Copenhagen beyond Noma: where to eat in Denmark's capital now",
    scrapedDescription: "Noma closed its restaurant in 2024. What's left is better in some ways — the Noma generation has scattered across the city. Geranium still has three stars. The interesting eating is at places like Lillebror, the Empirical Spirits bar, and the cluster of natural wine spots in Vesterbro...",
    placeName: "Copenhagen", countryCode: "DK", lat: 55.68, lng: 12.57,
    tags: ["Denmark", "food", "restaurants", "wine", "design"], category: "destination",
  },
  {
    url: "https://www.frieze.com/article/mexico-city-art-guide-galleries-roma-norte",
    content: "frieze did a whole piece on roma norte galleries. kurimanzutto is the main one but there's a whole circuit of smaller spaces nearby. this needs a proper trip not just 4 days",
    scrapedTitle: "Mexico City's Art Scene: The Galleries Shaping a New Era",
    scrapedDescription: "Roma Norte has become one of the world's most interesting art neighbourhoods in the past decade. Kurimanzutto is the anchor, but the smaller spaces around Álvaro Obregón — Parque Galería, Labor — are where the real energy is. The circuit takes two full days to do properly...",
    placeName: "Mexico City", countryCode: "MX", lat: 19.43, lng: -99.13,
    tags: ["Mexico", "art", "galleries", "design", "contemporary"], category: "destination",
  },
  {
    url: "https://www.theguardian.com/travel/2023/oct/09/karakoy-istanbul-new-guide-galleries-restaurants",
    content: "istanbul modern + the antique dealers in çukurcuma. the meyhane dinner culture sounds like exactly the kind of evening i want",
    scrapedTitle: "Karaköy and Çukurcuma: Istanbul's most interesting neighbourhoods right now",
    scrapedDescription: "Karaköy has the Istanbul Modern and a run of natural wine bars and specialty coffee that didn't exist five years ago. Çukurcuma, just uphill, is where the serious antique dealers operate — not the grand bazaar kind, the real ones. A meyhane dinner with raki runs until midnight...",
    placeName: "Istanbul", countryCode: "TR", lat: 41.01, lng: 28.97,
    tags: ["Turkey", "art", "antiques", "food", "neighborhoods"], category: "destination",
  },
  {
    url: "https://www.artsy.net/article/artsy-editorial-vienna-art-week-galleries-not-miss",
    content: "vienna art week is in november. might time a trip around it. the secession building alone is worth it and the kaffeehäuser thing is actually real",
    scrapedTitle: "Vienna Art Week: The Galleries and Shows Not to Miss",
    scrapedDescription: "Vienna Art Week runs every November — a week of gallery openings, museum previews, and collector events across the city. The Secession is always essential. The Kunsthalle Wien shows are consistently underrated. The coffeehouse culture as a working institution is not a tourist myth...",
    placeName: "Vienna", countryCode: "AT", lat: 48.21, lng: 16.37,
    tags: ["Austria", "art", "museums", "coffee", "architecture"], category: "destination",
  },
  {
    url: "https://www.seriouseats.com/best-restaurants-taipei-taiwan-guide",
    content: "serious eats taipei guide. the night market eating sounds genuinely different. also the fact that you can hike a mountain 20 minutes from downtown??",
    scrapedTitle: "Where to Eat in Taipei: The Serious Eats Guide",
    scrapedDescription: "Taipei is a genuinely great food city concentrated in a very small area. The night market circuit — Shilin, Raohe, Ningxia — rewards return visits because you keep finding things. The mountain trails above Beitou start at an MRT station and feel nothing like a city hike...",
    placeName: "Taipei", countryCode: "TW", lat: 25.03, lng: 121.56,
    tags: ["Taiwan", "food", "night market", "hiking", "design"], category: "destination",
  },
  {
    url: "https://www.eater.com/23697283/tbilisi-natural-wine-bars-qvevri-guide",
    content: "tbilisi natural wine scene. 8000 years of winemaking and you can drink it in a converted soviet building for $3 a glass. this is the one",
    scrapedTitle: "Tbilisi Is the Natural Wine World's New Capital",
    scrapedDescription: "Georgia has been making wine in clay qvevri vessels for 8,000 years. Tbilisi's bar scene is built entirely on this — amber wines, skin-contact whites, small producers from Kakheti arriving by the case. The bars themselves are in Soviet-era apartment blocks and postindustrial buildings from the 1970s...",
    placeName: "Tbilisi", countryCode: "GE", lat: 41.69, lng: 44.83,
    tags: ["Georgia", "wine", "bars", "Soviet architecture", "affordable"], category: "destination",
  },
  {
    url: "https://www.theguardian.com/travel/2022/jun/14/serralves-museum-porto-portugal-guide",
    content: "the serralves keeps coming up when people talk about underrated european museums. álvaro siza building. going to try to get there in october",
    scrapedTitle: "Serralves Museum: Porto's world-class contemporary art secret",
    scrapedDescription: "The Serralves Museum sits in a 1930s Art Deco villa with an Álvaro Siza-designed extension in the grounds. The permanent collection has Serra, Hockney, and Paolozzi. The park alone is worth the entrance fee. Porto's Baixa bookshops are a short tram ride from the museum gates...",
    placeName: "Porto", countryCode: "PT", lat: 41.15, lng: -8.61,
    tags: ["Portugal", "art", "museum", "architecture", "Álvaro Siza"], category: "destination",
  },
  {
    url: "https://www.dezeen.com/2023/03/15/marrakech-design-guide-majorelle-ysl-museum/",
    content: "the dezeen marrakech design guide is actually useful. jardin majorelle + the souk ceramics circuit. want a riad with a courtyard, not a hotel",
    scrapedTitle: "Marrakech design guide: from Majorelle Garden to the YSL Museum",
    scrapedDescription: "Marrakech has a complicated design culture — traditional medina crafts alongside YSL's maximalist garden and a new wave of architect-designed riads. The ceramics in the souk around Bab Ghemat are the real thing, not tourist stock. A riad stay changes the experience completely...",
    placeName: "Marrakech", countryCode: "MA", lat: 31.63, lng: -7.99,
    tags: ["Morocco", "design", "art", "riad", "ceramics"], category: "destination",
  },
  {
    url: "https://www.theguardian.com/travel/2024/feb/26/lx-factory-lisbon-guide-creative-hub",
    content: "lx factory on a sunday. the ler devagar bookshop looks insane. need to pair this with the berardo for a proper art day in lisbon",
    scrapedTitle: "LX Factory: Lisbon's creative hub that still feels real",
    scrapedDescription: "LX Factory occupies a 19th-century textile complex in Alcântara. On Sundays the market takes over the cobbled courtyard. The Ler Devagar bookshop — a three-storey former printing hall filled with books and a suspended bicycle — is genuinely extraordinary. The Museu Berardo is 15 minutes by tram...",
    placeName: "Lisbon", countryCode: "PT", lat: 38.72, lng: -9.14,
    tags: ["Portugal", "art", "bookshops", "markets", "food"], category: "destination",
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
        url: s.url,
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
