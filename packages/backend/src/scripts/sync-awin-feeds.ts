import { fileURLToPath } from "node:url";
import { syncAllFeeds } from "../lib/awin-feed-sync.js";
import { logger } from "../lib/logger.js";
import { pool } from "../db/pool.js";

/**
 * Standalone entry point: `npm run sync:awin --workspace=@pricepilot/backend`
 *
 * Downloads and imports every Awin datafeed this publisher account has
 * access to. Safe to re-run - each row is upserted by (feed_id,
 * aw_product_id), so re-syncing just refreshes prices/stock.
 */
async function main(): Promise<void> {
  const results = await syncAllFeeds();
  const totalRows = results.reduce((sum, r) => sum + r.rows, 0);
  const failed = results.filter((r) => r.error);

  logger.info(
    { feeds: results.length, totalRows, failed: failed.length },
    "awin feed sync complete",
  );

  if (failed.length > 0) {
    logger.warn({ failed }, "some awin feeds failed to sync");
  }

  await pool.end();
  process.exit(failed.length > 0 && totalRows === 0 ? 1 : 0);
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    logger.error({ err }, "awin feed sync run failed");
    process.exit(1);
  });
}
