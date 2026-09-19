import { config } from "../config/env.js";
import { pool } from "../db/pool.js";
import { logger } from "./logger.js";

/**
 * Awin product data sync, against Awin's current REST API
 * (https://api.awin.com, OAuth2 Bearer auth) - see
 * https://help.awin.com/apidocs/introduction-1 and
 * https://help.awin.com/apidocs/retail-publisher-productapidocumentation-1.
 *
 * Awin has no live, cross-advertiser product search API. Instead, for each
 * advertiser (merchant) program a publisher has joined, Awin exposes a
 * per-advertiser product feed in Google Shopping's JSON Lines format. This
 * module lists the publisher's joined programmes, downloads each one's
 * feed, and upserts its rows into the local `awin_products` table so
 * AwinProvider can search it directly.
 *
 * An earlier version of this file targeted the legacy
 * `productdata.awin.com/datafeed/...` CSV endpoints with an apikey-in-URL
 * scheme. That API returns HTTP 500 for both valid and invalid keys - it
 * appears to have been retired - and has been replaced here with the
 * documented api.awin.com endpoints below.
 *
 * Run via `npm run sync:awin --workspace=@pricepilot/backend`, or on a
 * schedule (cron/Render cron job) - Awin feeds are typically refreshed
 * daily, so a nightly sync is a reasonable cadence to start with.
 */

const API_BASE = "https://api.awin.com";
const FEED_LOCALE = "de_DE";
const FEED_VERTICAL = "retail";

// Awin asks publishers to stay within 5 requests/minute against the
// enhanced-feed endpoint, and forbids concurrent requests to the same
// advertiser's feed. Since this only runs as a background sync job,
// latency doesn't matter - just space requests out to stay well under
// the limit even with several advertisers.
const MIN_MS_BETWEEN_FEED_REQUESTS = 13_000;

interface AwinProgramme {
  id: number;
  name: string;
  status?: string;
  currencyCode?: string;
  primaryRegion?: { countryCode?: string; name?: string };
}

function authHeaders(): Record<string, string> {
  if (!config.awin.apiToken) {
    throw new Error("AWIN_API_TOKEN is not set - cannot sync Awin feeds");
  }
  return { Authorization: `Bearer ${config.awin.apiToken}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Lists the advertiser programmes this publisher account has actually joined. */
export async function listJoinedProgrammes(): Promise<AwinProgramme[]> {
  const url = `${API_BASE}/publishers/${config.awin.publisherId}/programmes?relationship=joined`;
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Awin programmes request failed: ${response.status} ${body.slice(0, 300)}`);
  }
  return (await response.json()) as AwinProgramme[];
}

/** A single product record in Awin's Google-Shopping-format enhanced feed. */
interface AwinFeedProduct {
  id?: string;
  title?: string;
  description?: string;
  link?: string; // non-trackable direct product URL
  image_link?: string;
  price?: string; // e.g. "599.00 EUR"
  sale_price?: string;
  availability?: string; // "in_stock" | "out_of_stock" | "preorder" | "backorder"
  brand?: string;
  gtin?: string;
  mpn?: string;
  product_type?: string;
  google_product_category?: string;
  shipping?: Array<{ price?: string }>;
}

interface AwinFeedLine {
  meta?: { advertiser_id?: number; advertiser_name?: string };
  product_basic?: AwinFeedProduct;
  error?: number;
  message?: string;
  [key: string]: unknown;
}

function parseMoney(raw: string | undefined): { amount: number; currency: string } | undefined {
  if (!raw) return undefined;
  const match = raw.trim().match(/^([\d.,]+)\s*([A-Z]{3})$/);
  if (!match) return undefined;
  const amount = Number.parseFloat(match[1]!.replace(",", "."));
  if (!Number.isFinite(amount)) return undefined;
  return { amount, currency: match[2]! };
}

function isInStock(raw: string | undefined): boolean {
  return (raw ?? "in_stock").toLowerCase() === "in_stock";
}

/**
 * Downloads and upserts a single advertiser's enhanced feed into
 * `awin_products`. Returns the number of products upserted.
 */
export async function syncAdvertiserFeed(
  advertiserId: number,
  merchantName: string,
  locale: string = FEED_LOCALE,
): Promise<number> {
  const feedId = `${advertiserId}-${FEED_VERTICAL}-${locale}`;
  const url = `${API_BASE}/publishers/${config.awin.publisherId}/awinfeeds/download/${feedId}.jsonl`;

  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) {
    // A 404 here just means this advertiser has no feed published for
    // this locale (common - not every merchant publishes every locale),
    // not a real error worth failing the whole sync run over.
    if (response.status === 404) {
      await recordSyncResult(feedId, merchantName, 0, "no feed for this locale");
      return 0;
    }
    const body = await response.text().catch(() => "");
    const message = `Awin feed download failed for advertiser ${advertiserId}: ${response.status} ${body.slice(0, 300)}`;
    await recordSyncResult(feedId, merchantName, 0, message);
    throw new Error(message);
  }

  const text = await response.text();
  const lines = text.split("\n").filter((line) => line.trim().length > 0);

  let upserted = 0;
  let sawTrailingError: string | undefined;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const line of lines) {
      let parsed: AwinFeedLine;
      try {
        parsed = JSON.parse(line) as AwinFeedLine;
      } catch {
        continue; // skip malformed lines rather than fail the whole feed
      }

      if (parsed.error) {
        // Per Awin's docs, an error object can appear as the final line if
        // the download was cut short - note it, don't treat earlier lines
        // as invalid.
        sawTrailingError = parsed.message ?? `error ${parsed.error}`;
        continue;
      }

      const product = parsed.product_basic;
      if (!product?.id || !product.title || !product.link) continue;

      const price = parseMoney(product.sale_price) ?? parseMoney(product.price);
      if (!price) continue; // no usable price - skip rather than insert garbage

      const shippingCost = parseMoney(product.shipping?.[0]?.price)?.amount ?? 0;

      await client.query(
        `INSERT INTO awin_products (
          feed_id, merchant_id, merchant_name, aw_product_id, product_name,
          description, brand_name, category_name, ean, mpn, currency,
          price_amount, delivery_cost, aw_deep_link, merchant_product_url,
          image_url, in_stock, last_updated
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,now())
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
          last_updated = now(),
          synced_at = now()`,
        [
          feedId,
          String(advertiserId),
          merchantName,
          product.id,
          product.title,
          product.description ?? null,
          product.brand ?? null,
          product.google_product_category ?? product.product_type ?? null,
          product.gtin ?? null,
          product.mpn ?? null,
          price.currency,
          price.amount,
          shippingCost,
          // Awin's `link` field is explicitly non-trackable - the real
          // tracked click-through is built by AwinProvider.generateAffiliateUrl
          // from merchant_id + this URL, not stored pre-built here.
          product.link,
          product.link,
          product.image_link ?? null,
          isInStock(product.availability),
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

  await recordSyncResult(feedId, merchantName, upserted, sawTrailingError);
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

/** Syncs the enhanced feed for every advertiser programme this publisher has joined. */
export async function syncAllFeeds(): Promise<
  { advertiserId: number; merchantName: string; rows: number; error?: string }[]
> {
  const programmes = await listJoinedProgrammes();
  const results: { advertiserId: number; merchantName: string; rows: number; error?: string }[] =
    [];

  for (let i = 0; i < programmes.length; i++) {
    const programme = programmes[i]!;
    if (i > 0) await sleep(MIN_MS_BETWEEN_FEED_REQUESTS);

    try {
      const rows = await syncAdvertiserFeed(programme.id, programme.name);
      results.push({ advertiserId: programme.id, merchantName: programme.name, rows });
      logger.info(
        { advertiserId: programme.id, merchantName: programme.name, rows },
        "awin feed synced",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      results.push({ advertiserId: programme.id, merchantName: programme.name, rows: 0, error: message });
      logger.error(
        { advertiserId: programme.id, merchantName: programme.name, err },
        "awin feed sync failed",
      );
    }
  }

  return results;
}
