import type { Money, ProductIdentity } from "../shared/types.js";

/**
 * Local, on-device price-history cache.
 *
 * The backend's `price_snapshots` table (see packages/backend Phase 2
 * migrations) is the durable, cross-user source of truth for price
 * history, but no `GET` endpoint exposing it exists yet - that is backend
 * work for a later phase. Until then, the popup shows a per-device
 * history built purely from prices *this browser* has observed, stored in
 * chrome.storage.local (never synced, never sent anywhere). It is clearly
 * labeled "on this device" in the UI so it is never confused with a full
 * cross-retailer price history.
 */

export interface PriceHistoryPoint {
  readonly totalAmount: number;
  readonly currency: string;
  readonly merchantName: string;
  readonly observedAt: string;
}

const STORAGE_PREFIX = "pricepilot:history:";
const MAX_POINTS_PER_PRODUCT = 60;

function historyKey(productKey: string): string {
  return `${STORAGE_PREFIX}${productKey}`;
}

/**
 * A stable-ish key for a product, preferring strong identifiers.
 *
 * Takes `Pick<ProductIdentity, ...>` rather than a hand-duplicated inline
 * type: a separate inline shape without ProductIdentity's `| undefined`
 * unions (see shared/types.ts) would reject a real ProductIdentity value
 * under exactOptionalPropertyTypes, and silently drift out of sync if
 * ProductIdentity's fields ever change.
 */
export function productHistoryKey(
  identity: Pick<ProductIdentity, "ean" | "gtin" | "asin" | "mpn" | "title">,
): string {
  return identity.ean ?? identity.gtin ?? identity.asin ?? identity.mpn ?? identity.title;
}

export async function recordPricePoint(
  productKey: string,
  point: { totalPrice: Money; merchantName: string },
): Promise<void> {
  const key = historyKey(productKey);
  const stored = await chrome.storage.local.get(key);
  const existing: PriceHistoryPoint[] = Array.isArray(stored[key]) ? stored[key] : [];

  const next: PriceHistoryPoint[] = [
    ...existing,
    {
      totalAmount: point.totalPrice.amount,
      currency: point.totalPrice.currency,
      merchantName: point.merchantName,
      observedAt: new Date().toISOString(),
    },
  ].slice(-MAX_POINTS_PER_PRODUCT);

  await chrome.storage.local.set({ [key]: next });
}

export async function getPriceHistory(productKey: string): Promise<PriceHistoryPoint[]> {
  const key = historyKey(productKey);
  const stored = await chrome.storage.local.get(key);
  return Array.isArray(stored[key]) ? (stored[key] as PriceHistoryPoint[]) : [];
}

export async function clearAllPriceHistory(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k.startsWith(STORAGE_PREFIX));
  if (keys.length > 0) {
    await chrome.storage.local.remove(keys);
  }
}
