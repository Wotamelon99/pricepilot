import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool } from "./pool.js";
import { logger } from "../lib/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await pool.query<{ filename: string }>("SELECT filename FROM schema_migrations");
  return new Set(result.rows.map((row) => row.filename));
}

export async function runMigrations(): Promise<void> {
  await ensureMigrationsTable();
  const already = await appliedMigrations();

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  for (const file of files) {
    if (already.has(file)) {
      logger.debug({ file }, "migration already applied, skipping");
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    logger.info({ file }, "applying migration");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  logger.info({ count: files.length }, "migrations up to date");
}

// Allow running as a standalone script: `tsx src/db/migrate.ts`
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  runMigrations()
    .then(() => {
      logger.info("migration run complete");
      process.exit(0);
    })
    .catch((err) => {
      logger.error({ err }, "migration run failed");
      process.exit(1);
    });
}
