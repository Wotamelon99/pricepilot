import { detectProduct } from "./extraction/identity.js";
import { mountOverlay, OVERLAY_HOST_ELEMENT_ID } from "./overlay/mount.js";
import { getSettings, onSettingsChanged } from "../storage/settings.js";
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
let debounceHandle: ReturnType<typeof setTimeout> | undefined;
/** Last successfully detected product on this tab, regardless of whether the overlay is currently shown - the popup reads this via GetCurrentProductMessage. */
let lastDetectedProduct: DetectedProduct | undefined;

async function runDetectionAndMaybeMount(): Promise<void> {
  const product = detectProduct();
  lastDetectedProduct = product;

  if (!product) {
    currentUnmount?.();
    currentUnmount = undefined;
    return;
  }

  const settings = await getSettings();
  if (!settings.overlayEnabled) {
    currentUnmount?.();
    currentUnmount = undefined;
    return;
  }

  currentUnmount?.();
  currentUnmount = mountOverlay(product).unmount;
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
