# Where To — Full Product Design Spec

---

## What It Is

Where To is a travel decision engine built around group trips. It removes the social friction of collective planning by making a neutral third party — the app — hold the decisions, track the execution, and surface the verdict. Nobody has to decide. Nobody has to chase. Nobody has to carry the chaos.

---

## User Roles

Every trip has one of two roles. Roles are per-trip, not global — someone can be a coordinator in one trip and a member in another.

**Coordinator** — Creates the trip, invites members, opens decisions, assigns execution after verdicts close, nudges assigned members, manages the overview. The most important user. The growth vector.

**Member** — Joins via invite link, contributes comments to decision rooms, optionally shares saves visibility with specific people, executes assigned bookings, confirms when done.

---

## App Structure

Five top-level sections. Bottom navigation.

```
Saves → Trips → [Active trip] → Decisions / Overview
```

### Bottom Nav
- Saves (bookmark icon)
- Trips (compass icon)
- Decide (checkmark icon — solo decisions only)
- History (clock icon)

---

## Section 1: Saves

The personal library. Private by default. Always belongs to the individual, never to a trip.

**Save input — two methods:**

*Save a Link* — Paste any URL from Instagram, TikTok, Google Maps, Airbnb, YouTube, travel articles. App scrapes the source, strips all social metadata (likes, follower counts, hashtags, platform boilerplate), and generates a clean editorial save.

*Write a Note* — Freeform text. Place name, a feeling, something someone said. Gets tagged and geocoded the same way.

**What every save contains after processing:**

- Editorial title (e.g. "Arashiyama Bamboo Grove Kyoto" not "🔥 must visit!!")
- Category tag — hotel, restaurant, neighbourhood, nature, attraction, cafe, beach, resort
- Mood tags — 3 max, generated automatically (e.g. jungle / luxury / peaceful)
- Location — geocoded and pinned to map
- Source link — preserved but not displayed prominently
- Date saved

**No social metadata anywhere.** No likes count. No follower count. No creator handle. No platform branding. The place is the content.

**Two views:**

*Card list* — Browsable, filterable by category or mood tag. Most recent first.

*Map* — All saves pinned globally. Clustered by region. Click a pin for the card detail panel.

**Saves visibility — two tiers:**

*Private* — Default. Only you see them.

*Shared with specific people* — Bilateral opt-in only. Both people confirm. Neither person's library merges or moves. The other person gets read-only visibility. Used primarily by couples or close travel pairs planning together frequently.

---

## Section 2: Solo Decide

For single-user decisions. No group, no room. Just a question and a verdict.

**Input — one field only:**

A large open text box. No pre-selection step. No form. Just what's in their head in plain language.

Placeholder copy: *e.g. I really want to do a safari but doing one in Australia kinda doesn't hit the right vibe*

One button: **Get my verdict**

The app extracts key concepts from the question, matches them against the user's saved tags in Replit DB, pulls the top 15 most relevant saves, and generates the verdict. The user never selects what's included. The app decides what's relevant. Full scraped content is never stored or sent — only title, category, tags, and location per save.

**Verdict output structure — in this order:**

*THE QUESTION* — Their words verbatim. Italic. Blockquote style. Date underneath.

*THE VERDICT* — One answer. Large Playfair Display serif. No hedging.

*YOUR TRAVEL PATTERNS* — 2 to 3 bullet observations about what this person consistently wants, derived from their saves. Not categories or percentages. Actual qualitative observations about taste and orientation.

*YOUR CORE CONFLICT* — One sentence naming the psychological tension underneath the question.

*WHAT YOU'RE MISSING* — One insight they haven't articulated. The thing the app sees that they don't.

*WHY THIS FITS YOU* — One paragraph connecting the verdict to their patterns. Specific to their saves, not generic travel writing.

*TRADEOFFS* — What they give up with this choice. Honest, unsentimental.

*AVOID IF* — 2 to 3 conditions where this verdict doesn't apply.

*ACTION PLAN*
- Your next move (do this today) — one concrete action
- Start here — 3 anchor places or things to begin planning from
- Timing confidence — when to go and why

*STOP DOING THIS* — One behaviour or assumption to drop. Red left border. Direct voice.

*Based on your saves: [list of saves the app pulled — small text at bottom]*

**Two verdict types — app recognises which and handles differently:**

*Choose between options* — Pick one thing over another. Verdict names a winner, addresses the alternative in tradeoffs.

*Structure a trip* — How to sequence multiple modes, places, or experiences. Verdict returns an order of operations not a destination. Which thing first, how many days, why that sequence, what breaks if you mix them.

---

## Section 3: Trips

The group layer. Each trip is a persistent space for a specific travel group planning a specific journey.

**Creating a trip:**

Coordinator sets: trip name, destination(s), rough dates, members.

Invite via link. Members open the link in browser or app. No account required to view a verdict — but account required to add comments to a decision or have your saves included.

**Trip home screen shows:**

- Trip name and dates
- Members — avatars, who's coordinator
- Open decisions — count and titles
- Last activity timestamp
- Quick link to Overview

---

## Section 4: Decisions

Sub-channels inside a trip. Each decision is a contained question with its own comment thread, verdict, assignment, and status.

**Decision states — three only:**

*Undecided* — Open. Members are commenting. Verdict not yet run.

*Assigned* — Verdict closed. Execution assigned to one member. Not yet confirmed booked.

*Done* — Booked and confirmed. Automatically added to Overview.

**Creating a decision:**

Coordinator taps + New Decision and writes the question.

*e.g. Where do we stay — city hotel in Tokyo or ryokan first?*
*e.g. Which snorkeling option — Penida or Lembongan?*
*e.g. How many day trips can we realistically fit in 7 days?*

**Inside a decision room:**

Comment thread at the top. Members drop opinions, constraints, links, price references, anything relevant. Unstructured. No forms.

*e.g. I can't do more than 2 hours walking in a day*
*e.g. I want one really expensive meal and cheap everything else*
*e.g. https://klook.com/... — this one is $42pp*

Run Verdict button at the bottom. Coordinator controls when to run it.

**When verdict runs:**

App reads two inputs simultaneously — a set of semantically matched saves per member pulled silently in the background, plus everything in the comment thread. Generates a group verdict.

The app never sends all saves to the AI. See Technical Architecture for how matching works.

**Group verdict output — additional sections beyond solo:**

All standard solo sections plus:

*WHO GETS WHAT* — Named breakdown. What this decision specifically gives each person, drawn from their saves and stated orientation in the comments. Not generic.

*THE SEAM* — The one moment, meal, place, or experience where everyone is genuinely satisfied simultaneously. Not a compromise. The actual overlap.

*Per pax cost* — Always shown per person, never total only.

**After verdict runs:**

Coordinator sees: Accept Verdict button.

On accepting: Assign to field appears. Coordinator selects which member executes this booking. That member gets a notification — *You're booking [X]. Confirm when done.*

Assigned member sees: a task card with the verdict details, link if available, price, and a Confirm Booked button.

When they confirm: decision flips to Done. Entry auto-populates in Overview.

**Nudge mechanic:**

Coordinator sees all Assigned decisions and how long they've been sitting. One tap sends a neutral in-app nudge to the assigned member. Not a WhatsApp message. Not from the coordinator's name. From Where To. Nobody gets offended. The app is doing the chasing.

---

## Section 5: Trip Overview

The live record of everything closed. Builds itself as decisions are confirmed Done. Coordinator never manually maintains it.

**Structure:**

*Flights*
- Departure: date, time, airport, flight number, link
- Return: same
- Who's on each flight (relevant when group members travel from different cities)

*Booked*
- Item name
- Cost per pax
- Confirmation link
- Who booked it
- Status: Booked ✓

*Need to Book*
- All Assigned decisions not yet confirmed
- Shows who is responsible
- Price range per pax
- Link if available
- Coordinator nudge button inline

*Rough Guide*
- Auto-generated from booked items sorted by date
- Not a minute-by-minute itinerary
- Day blocks with 1 to 2 anchors each
- e.g. Day 1 — Arrive 1pm, dinner Locavore 6pm
- e.g. Day 2 — Mount Batur 3am, La Brisa lunch, spa 4:30pm

*Practical Notes*
- One freeform field
- Anything that doesn't fit elsewhere — insurance reminder, what to bring, local sim cards, entry requirements

**Per pax pricing — everywhere, always.**

Every single cost entry shows per person cost. Not total. Groups think in per pax. This is non-negotiable.

---

## Section 6: History

Solo use only. Chronological log of all past solo verdicts.

Each entry: THE QUESTION, THE VERDICT, date.

Over time this becomes the identity layer. The pattern of decisions reveals who the user is as a traveler. No label is ever assigned. The pattern speaks for itself.

---

## The Shareable Card

Two card types. Both generated from the same verdict. One tap to share as image.

**Travel Patterns Card** — For sharing identity, not decisions.

Shows YOUR TRAVEL PATTERNS section only. 2 to 3 lines of qualitative observation. Clean off-white background. Playfair Display. Where To logo very small at bottom. Feels like something you typed, not something a brand made. Sent to friends as "this is literally me." Organic acquisition mechanism.

**Group Verdict Card** — For sharing decisions in group chats.

Shows THE QUESTION (short form), THE VERDICT, WHO GETS WHAT (condensed), THE SEAM. Same aesthetic. Nobody had to decide. The app decided. Goes into WhatsApp. Coordinator shares it. Everyone commits.

---

## Aesthetic

Off-white background (#F5F2EC or similar warm off-white).
Muted black text.
Olive and sand accents for buttons, tags, action elements.
Red left border only for STOP DOING THIS.
Playfair Display serif for all headings, verdicts, questions.
Clean sans-serif (Inter or similar) for body text and UI elements.

No engagement metrics anywhere in the product.
No like counts.
No save counts displayed as social proof.
No algorithmic signals.
No creator handles visible.
No platform branding on saves.

Feels like a travel journal. Not an app.

---

## What It Is Not

Not a social feed.
Not a public profile or trip sharing wall.
Not a community of travellers.
Not an itinerary template builder.
Not a competitor to Google Maps, TripAdvisor, or Klook.
Not a full expense tracker (Splitwise does that).
Not a logistics tool (the spreadsheet does that after the verdict).

Where To decides. You plan.

---

## Technical Architecture — Token Efficiency

**The constraint:**
Sending all saves to the AI per query is financially unviable at scale. 2,000 saves at 100 tokens each is 200,000 input tokens per decision. This is the most important technical decision in the product.

**The solution: tag-based matching, not vector search.**

All semantic compression happens at save time, not query time. By the time a user asks a question, the expensive work is already done and stored cheaply in Replit DB.

**At save creation — one-time cost:**

Scrape the source, clean it, generate the editorial title, category, and mood tags. Store the compressed output. Discard the full scraped content. The scraped text is used once and never stored.

What gets stored per save in Replit DB:
- Title (editorial, clean)
- Category (hotel / restaurant / neighbourhood / nature / attraction / cafe / beach / resort)
- Mood tags — array of 3 max (e.g. jungle, luxury, peaceful)
- Location string (geocoded place name)
- Source URL
- Date saved

Nothing else. No full scraped text. No embeddings. No external DB.

**At query time — cheap matching:**

When a question comes in, extract the key concepts from the question text. Simple keyword and semantic extraction — safari, luxury, wildlife, Africa, nature etc.

Match those concepts against each person's tag library. Find saves where category and mood tags overlap with the question concepts.

Send only matched saves to Claude — title, category, tags, location. Roughly 30 tokens per save.

Hard cap: 15 saves per person regardless of how many match.

**Token budget per verdict query:**

- 15 saves × 30 tokens × 2 people = 900 tokens
- Decision room comments = ~500 tokens
- Cached travel profile per person = ~150 tokens × 2 = 300 tokens
- System prompt = ~500 tokens
- Total input per verdict = under 2,500 tokens

This is manageable and cheap at any realistic user scale.

**Cached travel profile — background job:**

A 150 token summary per user stored in Replit DB. Generated when a user first hits 10 saves. Updated automatically every time they add 10 more saves after that. Never updated in real time.

Format: *"This user consistently saves luxury nature experiences, prioritises atmosphere over logistics, drawn to wildlife, slow travel, and cultural depth over tourist efficiency."*

Claude reads this profile first in every verdict. It provides the identity layer cheaply. The matched saves provide the specificity. Together they are sufficient for a high quality verdict without sending the full library.

**What this means in practice:**

The system prompt instructs Claude: here is the user's travel profile, here are their 15 most relevant saves for this question, here is the decision room context. Generate a verdict.

No vector database. No Pinecone. No Supabase pgvector. No external dependencies at MVP. Everything lives in Replit DB until revenue justifies adding infrastructure.

**When to revisit this architecture:**

When a single user consistently has poor verdict quality due to tag matching missing relevant saves — that's the signal to add semantic search. Not before.

---

## Immediate Build Priority

1. Fix Decide — question field first, no pre-selection step, app pulls saves silently
2. Strip remaining social metadata leaking through on save cards
3. Build group trip structure — trip home screen, member invites, decision rooms
4. Build decision states — Undecided / Assigned / Done
5. Build group verdict output — WHO GETS WHAT and THE SEAM sections
6. Build assignment and nudge mechanic
7. Build trip overview — auto-populates from closed decisions
8. Build shareable cards — Travel Patterns card and Group Verdict card
9. Add per pax cost field to all activity entries
10. Build decision type logic — choose between options vs structure a trip

---

## The One Rule That Holds Everything Together

Saves belong to people, not trips. Nothing merges. Nothing moves. The group trip borrows visibility of everyone's saves temporarily. The AI decides what's relevant. Users never manage what goes into the pool.

The moment users have to curate what the AI sees, you've rebuilt the problem you were trying to solve.
