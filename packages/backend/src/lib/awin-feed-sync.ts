import { parseCsv } from "./csv.js";
import { config } from "../config/env.js";
import { pool } from "../db/pool.js";
import { logger } from "./logger.js";

/**
 * Awin datafeed sync.
 *
 * Awin does not offer a live, cross-advertiser product search API (see
 * awin-provider.ts). Instead, each advertiser (merchant) program you've
 * been accepted into publishes a downloadable CSV product feed. This
 * module lists the feeds your publisher account can access, downloads
 * each one, and upserts its rows into the local `awin_products` table so
 * AwinProvider can search it directly.
 *
 * Run via `npm run sync:awin --workspace=@pricepilot/backend`, or on a
 * schedule (cron/Render cron job) - Awin feeds are typically refreshed
 * daily, so a nightly sync is a reasonable cadence to start with.
 */

const FEED_COLUMNS = [
  "aw_deep_link",
  "product_name",
  "aw_product_id",
  "merchant_product_id",
  "description",
  "merchant_category",
  "search_price",
  "merchant_name",
  "merchant_id",
  "category_name",
  "currency",
  "delivery_cost",
  "merchant_deep_link",
  "last_updated",
  "in_stock",
  "brand_name",
  "ean",
  "mpn",
  "aw_image_url",
  "merchant_image_url",
] as const;

interface AwinFeedListRow {
  "Feed ID": string;
  "Advertiser ID": string;
  "Advertiser Name": string;
  "Membership Status"?: string;
  "Approved"?: string;
}

interface AwinFeedRow {
  aw_deep_link?: string;
  product_name?: string;
  aw_product_id?: string;
  merchant_product_id?: string;
  description?: string;
  search_price?: string;
  merchant_name?: string;
  merchant_id?: string;
  category_name?: string;
  currency?: string;
  delivery_cost?: string;
  merchant_deep_link?: string;
  last_updated?: string;
  in_stock?: string;
  brand_name?: string;
  ean?: string;
  mpn?: string;
  aw_image_url?: string;
  merchant_image_url?: string;
}

function requireApiToken(): string {
  if (!config.awin.apiToken) {
    throw new Error("AWIN_API_TOKEN is not set - cannot sync Awin feeds");
  }
  return config.awin.apiToken;
}

/**
 * Lists every datafeed this publisher account can access - one row per
 * advertiser program you've joined and been approved for.
 */
export async function listAvailableFeeds(): Promise<AwinFeedListRow[]> {
  const apiKey = requireApiToken();
  const url = `https://${config.awin.productDataHost}/datafeed/list/apikey/${apiKey}`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Awin feed list request failed: ${response.status}`);
  }
  const csvText = await response.text();
  return parseCsv(csvText) as unknown as AwinFeedListRow[];
}

function parseMoney(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const cleaned = raw.replace(",", ".").trim();
  const value = Number.parseFloat(cleaned);
  return Number.isFinite(value) ? value : undefined;
}

function parseInStock(raw: string | undefined): boolean {
  if (!raw) return true;
  const v = raw.trim().toLowerCase();
  return !["0", "no", "false", "out of stock", "outofstock", "unavailable"].includes(v);
}

/** Downloads and upserts a single feed's rows into `awin_products`. */
export async function syncFeed(feedId: string, merchantName?: string): Promise<number> {
  const apiKey = requireApiToken();
  const columns = FEED_COLUMNS.join(",");
  const url =
    `https://${config.awin.productDataHost}/datafeed/download/apikey/${apiKey}` +
    `/language/any/fid/${feedId}/format/csv/delimiter/%2C/columns/${columns}`;

  const response = await fetch(url);
  if (!response.ok) {
    const message = `Awin feed download failed for feed ${feedId}: ${response.status}`;
    await recordSyncResult(feedId, merchantName, 0, message);
    throw new Error(message);
  }

  const csvText = await response.text();
  let rows: AwinFeedRow[];
  try {
    rows = parseCsv(csvText) as unknown as AwinFeedRow[];
  } catch (err) {
    const message = err instanceof Error ? err.message : "CSV parse error";
    await recordSyncResult(feedId, merchantName, 0, message);
    throw err;
  }

  let upserted = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const row of rows) {
      const price = parseMoney(row.search_price);
      if (!row.aw_product_id || !row.product_name || price === undefined || !row.aw_deep_link) {
        continue; // skip incomplete rows rather than insert garbage
      }
      await client.query(
        `INSERT INTO awin_products (
          feed_id, merchant_id, merchant_name, aw_product_id, product_name,
          description, brand_name, category_name, ean, mpn, currency,
          price_amount, delivery_cost, aw_deep_link, merchant_product_url,
          image_url, in_stock, last_updated
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        ON CONFLICT (feed_id, aw_product_id) DO UPDATE SET
          merchant_name = EXCLUDED.merchant_name,
          product_name = EXCLUDED.product_name,
          description = EXCLUDED.description,
          brand_name = EXCLUDED.brand_name,
          category_name = EXCLUDED.category_name,
          ean = EXCLUDED.ean,
          mpn = EXCLUDED.mpn,
          currency = EXCLUDED.currency,
          price_amount = EXCLUDED.price_amount,
          delivery_cost = EXCLUDED.delivery_cost,
          aw_deep_link = EXCLUDED.aw_deep_link,
          merchant_product_url = EXCLUDED.merchant_product_url,
          image_url = EXCLUDED.image_url,
          in_stock = EXCLUDED.in_stock,
          last_updated = EXCLUDED.last_updated,
          synced_at = now()`,
        [
          feedId,
          row.merchant_id ?? "unknown",
          row.merchant_name ?? merchantName ?? "Unknown Merchant",
          row.aw_product_id,
          row.product_name,
          row.description ?? null,
          row.brand_name ?? null,
          row.category_name ?? null,
          row.ean ?? null,
          row.mpn ?? null,
          row.currency ?? "EUR",
          price,
          parseMoney(row.delivery_cost) ?? 0,
          row.aw_deep_link,
          row.merchant_deep_link ?? null,
          row.aw_image_url ?? row.merchant_image_url ?? null,
          parseInStock(row.in_stock),
          row.last_updated ? new Date(row.last_updated) : null,
        ],
      );
      upserted += 1;
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  await recordSyncResult(feedId, merchantName, upserted);
  return upserted;
}

async function recordSyncResult(
  feedId: string,
  merchantName: string | undefined,
  rowCount: number,
  error?: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO awin_feed_syncs (feed_id, merchant_name, row_count, last_synced_at, last_error)
     VALUES ($1, $2, $3, now(), $4)
     ON CONFLICT (feed_id) DO UPDATE SET
       merchant_name = EXCLUDED.merchant_name,
       row_count = EXCLUDED.row_count,
       last_synced_at = now(),
       last_error = EXCLUDED.last_error`,
    [feedId, merchantName ?? null, rowCount, error ?? null],
  );
}

/** Syncs every feed the publisher account currently has access to. */
export async function syncAllFeeds(): Promise<{ feedId: string; rows: number; error?: string }[]> {
  const feeds = await listAvailableFeeds();
  const results: { feedId: string; rows: number; error?: string }[] = [];

  for (const feed of feeds) {
    const feedId = feed["Feed ID"];
    const merchantName = feed["Advertiser Name"];
    try {
      const rows = await syncFeed(feedId, merchantName);
      results.push({ feedId, rows });
      logger.info({ feedId, merchantName, rows }, "awin feed synced");
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      results.push({ feedId, rows: 0, error: message });
      logger.error({ feedId, merchantName, err }, "awin feed sync failed");
    }
  }

  return results;
}
