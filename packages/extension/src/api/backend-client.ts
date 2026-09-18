import type { DetectedProduct, SearchResponse } from "../shared/types.js";

/**
 * Client for the PricePilot backend (packages/backend). Only ever called
 * from the background service worker, which holds host_permissions for
 * the backend origin(s) - see manifest.config.ts. The content script never
 * calls this directly.
 */

export class BackendRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "BackendRequestError";
  }
}

function toSearchBody(product: DetectedProduct): Record<string, string> {
  const { identity } = product;
  const body: Record<string, string> = {};
  if (identity.ean) body.ean = identity.ean;
  if (identity.gtin) body.gtin = identity.gtin;
  if (identity.asin) body.asin = identity.asin;
  if (identity.mpn) body.mpn = identity.mpn;
  if (identity.sku) body.sku = identity.sku;
  if (identity.brand) body.brand = identity.brand;
  if (identity.category) body.category = identity.category;
  // Always include the title too, as a fallback match signal server-side.
  body.query = identity.title;
  return body;
}

/**
 * Calls POST /api/products/search on the configured backend and returns
 * the parsed response. Throws BackendRequestError on any non-2xx response
 * or network failure so the caller can decide how to surface it.
 */
export async function searchProduct(
  backendBaseUrl: string,
  product: DetectedProduct,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const url = new URL("/api/products/search", backendBaseUrl).toString();

  // lib.dom's RequestInit types `signal` as `AbortSignal | null` (no
  // `undefined`), so under exactOptionalPropertyTypes the key must be
  // omitted entirely when our own optional `signal` param wasn't passed,
  // rather than assigned `undefined`.
  const requestInit: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(toSearchBody(product)),
    ...(signal ? { signal } : {}),
  };

  let response: Response;
  try {
    response = await fetch(url, requestInit);
  } catch (err) {
    throw new BackendRequestError(
      `Could not reach PricePilot backend at ${backendBaseUrl}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  if (!response.ok) {
    throw new BackendRequestError(`Backend responded with ${response.status}`, response.status);
  }

  return (await response.json()) as SearchResponse;
}

/** Builds the click-redirect URL for a given offer; navigating to it logs the click and 302s to the affiliate link. */
export function buildClickUrl(backendBaseUrl: string, offerId: string): string {
  return new URL(`/api/offers/${encodeURIComponent(offerId)}/click`, backendBaseUrl).toString();
}
