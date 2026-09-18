import { buildApp } from "./app.js";
import { config } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { cache } from "./lib/cache.js";
import { runMigrations } from "./db/migrate.js";
import { pool } from "./db/pool.js";

async function main(): Promise<void> {
  await runMigrations();
  await cache.connect();

  const app = await buildApp();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, "shutting down");
    await app.close();
    await cache.disconnect();
    await pool.end();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: config.port, host: config.host });
  logger.info({ port: config.port }, "PricePilot backend listening");
}

main().catch((err) => {
  logger.error({ err }, "fatal startup error");
  process.exit(1);
});
