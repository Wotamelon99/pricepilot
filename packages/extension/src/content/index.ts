import { detectProduct } from "./extraction/identity.js";
import { mountOverlay, OVERLAY_HOST_ELEMENT_ID } from "./overlay/mount.js";
import { getSettings, onSettingsChanged } from "../storage/settings.js";
import { productHistoryKey } from "../storage/price-history.js";
import { isGetCurrentProductMessage, type GetCurrentProductResponse } from "../shared/messages.js";
import type { DetectedProduct } from "../shared/types.js";

/**
 * Content script entry point. Runs at document_idle on every matched
 * merchant page (see manifest.config.ts). Detects a product, and - if
 * detection succeeds and the user hasn't disabled the overlay - mounts
 * the comparison overlay in its own Shadow DOM root.
 *
 * Many merchant product pages are single-page apps that swap content
 * without a full navigation, so a MutationObserver re-runs detection
 * (debounced) whenever the page's title or main content changes.
 */

let currentUnmount: (() => void) | undefined;
/** Identity key of the product the overlay is currently mounted for, so a re-detection that finds the *same* product (e.g. another DOM mutation wave while the page is still settling) doesn't tear down and re-fetch a perfectly fine overlay. */
let currentProductKey: string | undefined;
let debounceHandle: ReturnType<typeof setTimeout> | undefined;
/** Last successfully detected product on this tab, regardless of whether the overlay is currently shown - the popup reads this via GetCurrentProductMessage. */
let lastDetectedProduct: DetectedProduct | undefined;

function unmountOverlay(): void {
  currentUnmount?.();
  currentUnmount = undefined;
  currentProductKey = undefined;
}

async function runDetectionAndMaybeMount(): Promise<void> {
  const product = detectProduct();
  lastDetectedProduct = product;

  if (!product) {
    unmountOverlay();
    return;
  }

  const settings = await getSettings();
  if (!settings.overlayEnabled) {
    unmountOverlay();
    return;
  }

  const productKey = productHistoryKey(product.identity);
  if (productKey === currentProductKey) {
    // Same product as what's already mounted - a page that's still
    // settling (lazy images, ads, SPA hydration) can trigger several
    // detection passes within a second or two of load; without this
    // check each one would tear down and rebuild the overlay from
    // scratch (fresh "loading" state, fresh backend request), which
    // looks like the overlay popping up 2-3 times in a row.
    return;
  }

  currentUnmount?.();
  currentUnmount = mountOverlay(product).unmount;
  currentProductKey = productKey;
}

function scheduleDetection(): void {
  if (debounceHandle) clearTimeout(debounceHandle);
  debounceHandle = setTimeout(() => {
    void runDetectionAndMaybeMount();
  }, 400);
}

// Initial run.
scheduleDetection();

// Re-detect on SPA-style content swaps (title changes are a cheap, broad
// signal that the "page" changed without a full reload).
//
// IMPORTANT: mountOverlay() itself adds/removes a direct child of
// document.documentElement (the shadow-DOM host element), which this
// observer would otherwise see as "the page changed" - remounting the
// overlay, which mutates the DOM again, which reschedules detection again,
// forever. Every mutation batch that consists solely of that host element
// being added/removed is therefore ignored.
const observer = new MutationObserver((mutations) => {
  const onlyOverlayMutations = mutations.every((mutation) =>
    [...mutation.addedNodes, ...mutation.removedNodes].every(
      (node) => node instanceof Element && node.id === OVERLAY_HOST_ELEMENT_ID,
    ),
  );
  if (onlyOverlayMutations) return;
  scheduleDetection();
});
observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
  attributes: false,
});

// React immediately if the user toggles the overlay off/on in the popup,
// without waiting for the next DOM mutation.
onSettingsChanged(() => scheduleDetection());

// Answer the popup's "what did you detect on this tab?" query.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isGetCurrentProductMessage(message)) {
    sendResponse({
      type: "pricepilot:current-product",
      ...(lastDetectedProduct ? { product: lastDetectedProduct } : {}),
    } satisfies GetCurrentProductResponse);
    return true;
  }
  return false;
});
