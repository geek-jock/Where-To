# Where-To

AI-assisted group trip planning — turns "where should we go" into an actual decision, not an endless group chat.

## What it does

- Save and tag destination/activity options (auto-geocoded), added manually or pulled in via a URL scraper
- Invite friends to a trip; everyone's saved options and comments land in one shared view
- When the group can't converge, an AI decision engine picks one option from what's actually on the table and explains itself — the core conflict, the tradeoffs, what you're missing, the next move — instead of a generic suggestion
- Trip overview notes, notifications, and history across multiple trips
- Native mobile app (Expo/React Native) alongside the web app, sharing one API

## Stack

- pnpm monorepo, TypeScript, Node 24
- API: Express 5, Clerk auth, PostgreSQL + Drizzle ORM, Zod validation
- Contract-first API: OpenAPI spec → Orval-generated client hooks + Zod schemas
- AI: OpenAI-backed decision engine, constrained to structured JSON output rather than free-text
- Web: React + Vite · Mobile: Expo Router · Build: esbuild

## Status

Personal project, built and iterated on Replit. A working prototype exploring group-decision UX and structured AI output — not in production.
