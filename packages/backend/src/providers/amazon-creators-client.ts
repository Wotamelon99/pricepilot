import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Thin client for Amazon's "Creators API", which replaced the retired
 * PA-API 5.0 (see amazon-provider.ts for the deprecation background).
 *
 * Auth model: OAuth2 client-credentials-style exchange of a Credential
 * ID/Secret pair for a short-lived bearer token, cached in-process and
 * refreshed shortly before it expires.
 *
 * NOTE: this integration is written against Amazon's published Creators
 * API documentation as of early 2026. Amazon does not publish a stable
 * OpenAPI schema for this API, so exact field names/paths may need small
 * adjustments once exercised against a real, approved Associates account -
 * if a request fails with an unexpected shape, check the error body logged
 * by `logger.error` here first.
 */

const TOKEN_URL = "https://api.amazon.com/auth/o2/token";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

let cachedToken: { value: string; expiresAt: number } | undefined;

async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 30_000 > now) {
    return cachedToken.value;
  }

  if (!config.amazon.credentialId || !config.amazon.credentialSecret) {
    throw new Error("Amazon Creators API credentials are not configured");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: config.amazon.credentialId,
      client_secret: config.amazon.credentialSecret,
      scope: "creatorsapi::search",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Amazon Creators API token request failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }

  const data = (await response.json()) as TokenResponse;
  cachedToken = {
    value: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return cachedToken.value;
}

async function creatorsApiRequest<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const token = await getAccessToken();
  const url = `https://${config.amazon.apiHost}/catalog/v1${path}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    logger.error(
      { status: response.status, path, body: errText.slice(0, 1000) },
      "amazon creators api request failed",
    );
    throw new Error(`Amazon Creators API request to ${path} failed (${response.status})`);
  }

  return (await response.json()) as T;
}

/** Loosely-typed response shapes: Amazon does not publish a strict schema. */
export interface CreatorsApiOffer {
  price?: { amount?: number; currency?: string; displayAmount?: string };
  availability?: { message?: string; type?: string };
  condition?: { value?: string };
}

export interface CreatorsApiItem {
  asin?: string;
  detailPageUrl?: string;
  itemInfo?: {
    title?: { displayValue?: string };
    byLineInfo?: { brand?: { displayValue?: string }; manufacturer?: { displayValue?: string } };
    classifications?: { productGroup?: { displayValue?: string } };
    externalIds?: { eANs?: { displayValues?: string[] }; uPCs?: { displayValues?: string[] } };
  };
  images?: { primary?: { medium?: { url?: string }; large?: { url?: string } } };
  offers?: { listings?: CreatorsApiOffer[] };
}

interface SearchItemsResponse {
  searchResult?: { items?: CreatorsApiItem[] };
  errors?: Array<{ code?: string; message?: string }>;
}

interface GetItemsResponse {
  itemsResult?: { items?: CreatorsApiItem[] };
  errors?: Array<{ code?: string; message?: string }>;
}

const DEFAULT_RESOURCES = [
  "itemInfo.title",
  "itemInfo.byLineInfo",
  "itemInfo.classifications",
  "itemInfo.externalIds",
  "images.primary.medium",
  "offers.listings.price",
  "offers.listings.availability",
  "offers.listings.condition",
];

export async function searchItems(keywords: string, itemCount = 10): Promise<CreatorsApiItem[]> {
  const response = await creatorsApiRequest<SearchItemsResponse>("/searchItems", {
    keywords,
    partnerTag: config.amazon.partnerTag,
    partnerType: "Associates",
    marketplace: config.amazon.marketplace,
    itemCount,
    resources: DEFAULT_RESOURCES,
  });

  if (response.errors?.length) {
    logger.warn({ errors: response.errors }, "amazon creators api returned errors");
  }

  return response.searchResult?.items ?? [];
}

export async function getItemsByAsin(asins: string[]): Promise<CreatorsApiItem[]> {
  if (asins.length === 0) return [];
  const response = await creatorsApiRequest<GetItemsResponse>("/getItems", {
    itemIds: asins,
    partnerTag: config.amazon.partnerTag,
    partnerType: "Associates",
    marketplace: config.amazon.marketplace,
    resources: DEFAULT_RESOURCES,
  });

  if (response.errors?.length) {
    logger.warn({ errors: response.errors }, "amazon creators api returned errors");
  }

  return response.itemsResult?.items ?? [];
}
