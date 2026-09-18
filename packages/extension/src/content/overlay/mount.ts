import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import overlayStyles from "./overlay.css?inline";
import { Overlay } from "./Overlay.js";
import type { DetectedProduct } from "../../shared/types.js";

export const OVERLAY_HOST_ELEMENT_ID = "pricepilot-overlay-host";

/**
 * Mounts the overlay into an isolated Shadow DOM root appended to
 * document.documentElement (not document.body, which some merchant SPAs
 * replace/re-render wholesale). Shadow DOM guarantees the host page's CSS
 * cannot style the overlay, and the overlay's CSS (injected as a <style>
 * inside the shadow root, see overlayStyles above) cannot leak back out.
 */
export function mountOverlay(product: DetectedProduct): { unmount: () => void } {
  removeExistingOverlay();

  const hostElement = document.createElement("div");
  hostElement.id = OVERLAY_HOST_ELEMENT_ID;
  document.documentElement.appendChild(hostElement);

  const shadowRoot = hostElement.attachShadow({ mode: "open" });

  const styleTag = document.createElement("style");
  styleTag.textContent = overlayStyles;
  shadowRoot.appendChild(styleTag);

  const reactMountPoint = document.createElement("div");
  shadowRoot.appendChild(reactMountPoint);

  const root: Root = createRoot(reactMountPoint);
  root.render(createElement(Overlay, { product, onClose: () => unmount() }));

  function unmount(): void {
    root.unmount();
    hostElement.remove();
  }

  return { unmount };
}

function removeExistingOverlay(): void {
  document.getElementById(OVERLAY_HOST_ELEMENT_ID)?.remove();
}
