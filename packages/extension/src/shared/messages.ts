import type { DetectedProduct, SearchResponse } from "./types.js";

/**
 * Typed message contract between the content script and the background
 * service worker. All cross-origin fetches to the backend happen in the
 * background worker (it holds host_permissions for the backend origin),
 * never in the content script, which runs in the merchant page's own
 * (untrusted, CSP-restricted) context.
 */

export interface SearchRequestMessage {
  readonly type: "pricepilot:search";
  readonly product: DetectedProduct;
}

export interface SearchResponseMessage {
  readonly type: "pricepilot:search-result";
  readonly ok: boolean;
  readonly data?: SearchResponse;
  readonly error?: string;
}

export interface GetSettingsMessage {
  readonly type: "pricepilot:get-settings";
}

/** Sent by the popup (via chrome.tabs.sendMessage) to ask the content script on that tab what it last detected, if anything. */
export interface GetCurrentProductMessage {
  readonly type: "pricepilot:get-current-product";
}

export interface GetCurrentProductResponse {
  readonly type: "pricepilot:current-product";
  readonly product?: DetectedProduct;
}

export type ExtensionMessage = SearchRequestMessage | GetSettingsMessage | GetCurrentProductMessage;

export function isSearchRequestMessage(msg: unknown): msg is SearchRequestMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "pricepilot:search"
  );
}

export function isGetSettingsMessage(msg: unknown): msg is GetSettingsMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "pricepilot:get-settings"
  );
}

export function isGetCurrentProductMessage(msg: unknown): msg is GetCurrentProductMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as { type?: unknown }).type === "pricepilot:get-current-product"
  );
}
