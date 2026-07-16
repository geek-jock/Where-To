import pg from "pg";

const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query(`
      ALTER TABLE group_decisions
        ADD COLUMN IF NOT EXISTS cost_per_pax TEXT,
        ADD COLUMN IF NOT EXISTS confirmation_link TEXT
    `);
    console.log("✓ Added cost_per_pax and confirmation_link to group_decisions");

    await client.query(`
      CREATE TABLE IF NOT EXISTS trip_overview_notes (
        trip_id INTEGER PRIMARY KEY REFERENCES trips(id) ON DELETE CASCADE,
        content TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("✓ Created trip_overview_notes table");

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
    console.log("✓ Created notifications table");

    console.log("Migration complete.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
