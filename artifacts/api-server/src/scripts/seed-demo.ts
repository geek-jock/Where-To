/**
 * Seed 3 demo profiles with realistic saves, AI-generated decisions, travel
 * profiles, a group trip with 3 decision rooms, comments, and a bilateral
 * friend share between Elena and Nina.
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
} from "@workspace/db";
import { openai } from "@workspace/integrations-openai-ai-server";
import { verdictJsonSchema, groupVerdictJsonSchema } from "@workspace/db";
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

// ── Hardcoded travel profiles ──────────────────────────────────────────────────

const TRAVEL_PROFILES: Record<string, string> = {
  demo_elena:
    "Slow wanderer anchored by food markets and fermented things. Gravitates toward Southern Europe and Mexico in 3–4 week stretches. Rents a room over a hotel and builds a local routine within days — a market, a bar, a walking circuit. Makes decisions based on seasonal produce and neighbourhood density, not highlights. Avoids anywhere that's been fully discovered.",
  demo_james:
    "Extreme terrain chaser with limited patience for infrastructure. Goes where roads end or require permits. Plans in 10–20 day blocks for full wilderness immersion. Allocates budget to permits, guides, and helicopter access — not accommodation. Off-season is the point. Has been to every continent and still has a list.",
  demo_nina:
    "High-density city break specialist. 5–7 days, one neighbourhood per city, galleries every morning, serious dinner every night. Researches restaurant lists for weeks in advance. Leaves knowing the neighbourhood better than the highlights. Cities are the destination, not the base.",
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
];

// ── Demo trip data (hardcoded, no AI needed) ───────────────────────────────────

const DEMO_TRIP_INVITE_TOKEN = "demo-trip-public";

const DEMO_GROUP_DECISIONS = [
  {
    question: "Week one — should we split up or stay together? Everyone has different priorities.",
    status: "done" as const,
    assignedTo: "demo_elena",
    costPerPax: "€420",
    confirmationLink: "https://airbnb.com",
    verdictJson: {
      type: "structure" as const,
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
    },
    comments: [
      { userId: "demo_james", displayName: "James", content: "I'm not spending a week in a city. If we're going southern Italy I need at least something with elevation or I'm doing a solo detour anyway." },
      { userId: "demo_nina", displayName: "Nina", content: "If James is going remote I'd genuinely rather have Athens to myself. I can get through three galleries before either of you have had breakfast." },
      { userId: "demo_elena", displayName: "Elena", content: "This is exactly why we should split. I'll coordinate the Sicily reunion. Book your own week one." },
    ],
  },
  {
    question: "Final 4 days — Sicily or Malta?",
    status: "assigned" as const,
    assignedTo: "demo_nina",
    costPerPax: null,
    confirmationLink: null,
    verdictJson: {
      type: "choose" as const,
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
    },
    comments: [
      { userId: "demo_nina", displayName: "Nina", content: "Malta feels like the sensible choice. Smaller, easier, everyone ends up in the same place." },
      { userId: "demo_james", displayName: "James", content: "Nina I respect you but I'm not flying to the Mediterranean and skipping Etna. It's a volcano. I have standards." },
      { userId: "demo_elena", displayName: "Elena", content: "Sicily. Malta is a different trip. The Ballarò market alone justifies it." },
    ],
  },
  {
    question: "That half-day in Catania when the split ends and before we move to Syracuse — what's the plan?",
    status: "undecided" as const,
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

  // ── Demo trip ──────────────────────────────────────────────────────────────
  console.log("\n── Demo trip ──");

  // Clear existing demo trip (cascade deletes members, decisions, comments)
  const existingTrips = await db
    .select()
    .from(tripsTable)
    .where(eq(tripsTable.inviteToken, DEMO_TRIP_INVITE_TOKEN));
  for (const trip of existingTrips) {
    await db.delete(tripsTable).where(eq(tripsTable.id, trip.id));
    console.log(`  Cleared existing demo trip (id ${trip.id})`);
  }

  // Create trip
  const [trip] = await db.insert(tripsTable).values({
    name: "Mediterranean September",
    destination: "Southern Italy + Sicily",
    startDate: "2025-09-01",
    endDate: "2025-09-14",
    coordinatorId: "demo_elena",
    inviteToken: DEMO_TRIP_INVITE_TOKEN,
  }).returning();
  console.log(`  Created trip id ${trip.id}`);

  // Add members
  await db.insert(tripMembersTable).values([
    { tripId: trip.id, userId: "demo_elena", role: "coordinator", displayName: "Elena Vasquez" },
    { tripId: trip.id, userId: "demo_james", role: "member", displayName: "James Okoro" },
    { tripId: trip.id, userId: "demo_nina", role: "member", displayName: "Nina Chen" },
  ]);
  console.log("  Added 3 members");

  // Create group decisions
  for (const dec of DEMO_GROUP_DECISIONS) {
    const [inserted] = await db.insert(groupDecisionsTable).values({
      tripId: trip.id,
      question: dec.question,
      status: dec.status,
      verdictJson: dec.verdictJson
        ? groupVerdictJsonSchema.parse(dec.verdictJson)
        : null,
      assignedTo: dec.assignedTo,
      costPerPax: dec.costPerPax,
      confirmationLink: dec.confirmationLink,
      createdBy: "demo_elena",
    }).returning();

    // Add comments
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

  // ── Friend sharing: Elena ↔ Nina ─────────────────────────────────────────
  console.log("\n── Friend sharing ──");

  // Clear existing demo friend shares
  await db
    .delete(saveShareRequestsTable)
    .where(eq(saveShareRequestsTable.fromUserId, "demo_elena"));
  await db
    .delete(saveShareRequestsTable)
    .where(eq(saveShareRequestsTable.fromUserId, "demo_nina"));

  // Elena → Nina (accepted)
  await db.insert(saveShareRequestsTable).values({
    fromUserId: "demo_elena",
    toEmail: "nina@demo.whereto.app",
    toUserId: "demo_nina",
    status: "accepted",
  });

  // Nina → Elena (accepted, bilateral)
  await db.insert(saveShareRequestsTable).values({
    fromUserId: "demo_nina",
    toEmail: "elena@demo.whereto.app",
    toUserId: "demo_elena",
    status: "accepted",
  });

  console.log("  ✓ Elena ↔ Nina friend share (accepted)");

  console.log("\nDone! Demo data seeded successfully.");
  process.exit(0);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
