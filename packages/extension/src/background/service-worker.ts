import { searchProduct, BackendRequestError } from "../api/backend-client.js";
import { getSettings } from "../storage/settings.js";
import {
  isSearchRequestMessage,
  isGetSettingsMessage,
  type SearchResponseMessage,
} from "../shared/messages.js";

/**
 * MV3 background service worker (module). Its two jobs:
 * 1. Relay product-search requests from content scripts to the backend
 *    (content scripts run in merchant-page contexts and should not hold
 *    the backend host_permissions themselves).
 * 2. Answer settings lookups so content scripts/popup share one source of
 *    truth without duplicating chrome.storage reads everywhere.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    // eslint-disable-next-line no-console
    console.info("[PricePilot] installed - free price comparison for DE/EU is ready.");
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isSearchRequestMessage(message)) {
    handleSearch(message.product)
      .then(sendResponse)
      .catch((err: unknown) => {
        sendResponse({
          type: "pricepilot:search-result",
          ok: false,
          error: err instanceof Error ? err.message : "Unknown error",
        } satisfies SearchResponseMessage);
      });
    return true; // keep the message channel open for the async response
  }

  if (isGetSettingsMessage(message)) {
    getSettings()
      .then(sendResponse)
      .catch(() => sendResponse(null));
    return true;
  }

  return false;
});

async function handleSearch(
  product: Parameters<typeof searchProduct>[1],
): Promise<SearchResponseMessage> {
  const settings = await getSettings();
  try {
    const data = await searchProduct(settings.backendBaseUrl, product);
    return { type: "pricepilot:search-result", ok: true, data };
  } catch (err) {
    const message =
      err instanceof BackendRequestError ? err.message : "Unexpected error contacting backend";
    return { type: "pricepilot:search-result", ok: false, error: message };
  }
}
