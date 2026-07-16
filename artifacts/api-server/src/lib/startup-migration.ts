import { pool } from "@workspace/db";
import { logger } from "./logger";

export async function runStartupMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    // Base tables (idempotent)
    await client.query(`
      CREATE TABLE IF NOT EXISTS saves (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        note TEXT,
        url TEXT,
        scraped_title TEXT,
        description TEXT,
        place_name TEXT,
        country_code TEXT,
        lat REAL,
        lng REAL,
        tags TEXT,
        category TEXT,
        official_link TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        user_id TEXT PRIMARY KEY,
        travel_profile TEXT,
        saves_count INTEGER NOT NULL DEFAULT 0,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS decisions (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        question TEXT NOT NULL,
        result TEXT NOT NULL,
        result_json JSONB,
        saves_snapshot TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trips (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        destination TEXT,
        start_date DATE,
        end_date DATE,
        coordinator_id TEXT NOT NULL,
        invite_token TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS trip_members (
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        display_name TEXT,
        avatar_url TEXT,
        joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (trip_id, user_id)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS group_decisions (
        id SERIAL PRIMARY KEY,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        question TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'undecided',
        verdict_json JSONB,
        assigned_to TEXT,
        created_by TEXT NOT NULL,
        cost_per_pax TEXT,
        confirmation_link TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS decision_comments (
        id SERIAL PRIMARY KEY,
        decision_id INTEGER NOT NULL REFERENCES group_decisions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        display_name TEXT,
        avatar_url TEXT,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // New tables for trip overview
    await client.query(`
      CREATE TABLE IF NOT EXISTS trip_overview_notes (
        trip_id INTEGER PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        trip_id INTEGER NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        decision_id INTEGER REFERENCES group_decisions(id) ON DELETE CASCADE,
        message TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // New columns on existing group_decisions (idempotent via IF NOT EXISTS)
    await client.query(`
      ALTER TABLE group_decisions
        ADD COLUMN IF NOT EXISTS cost_per_pax TEXT,
        ADD COLUMN IF NOT EXISTS confirmation_link TEXT
    `);

    logger.info("Startup migrations complete");
  } catch (err) {
    logger.error({ err }, "Startup migration failed — non-fatal, continuing");
  } finally {
    client.release();
  }
}
