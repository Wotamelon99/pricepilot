import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json" with { type: "json" };

/**
 * PricePilot Chrome Extension manifest (Manifest V3).
 *
 * Host permissions are scoped to the initial DE/EU merchant set named in
 * the project spec (Amazon.de, Otto.de, MediaMarkt.de, Saturn.de) plus the
 * local/production backend origins the background worker calls. Adding a
 * new merchant means adding its origin here AND a matching extractor under
 * src/content/extraction/sites/ - the two are meant to stay in lockstep.
 */

const MERCHANT_MATCHES = [
  "https://www.amazon.de/*",
  "https://www.otto.de/*",
  "https://www.mediamarkt.de/*",
  "https://www.saturn.de/*",
];

// The backend origins the background service worker is allowed to call.
// PUBLIC_BACKEND_ORIGIN can be overridden at build time (see vite.config.ts)
// to point production builds at a deployed backend instead of localhost.
const BACKEND_HOST_PERMISSIONS = [
  "http://localhost:3000/*",
  "https://api.pricepilot.example/*", // placeholder for the production backend
];

export default defineManifest({
  manifest_version: 3,
  name: "PricePilot – Preisvergleich für DE/EU",
  description:
    "Kostenloser Preisvergleich für Elektronik, PC- und Gaming-Hardware. Findet automatisch günstigere Angebote auf unterstützten Shops.",
  version: pkg.version,
  // No default_locale: name/description below are plain hardcoded German
  // strings, not __MSG_*__ i18n placeholders, so no _locales/ directory
  // exists. Declaring default_locale without matching _locales/<locale>/
  // messages.json files is what the Chrome Web Store flagged as "default_locale
  // fehlt im Manifest" - the field gets dropped when its locale files are
  // missing, so the built manifest.json ends up without it either way.
  icons: {
    "16": "public/icons/icon16.png",
    "48": "public/icons/icon48.png",
    "128": "public/icons/icon128.png",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_icon: {
      "16": "public/icons/icon16.png",
      "48": "public/icons/icon48.png",
      "128": "public/icons/icon128.png",
    },
    default_title: "PricePilot",
  },
  options_page: "src/options/index.html",
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      matches: MERCHANT_MATCHES,
      js: ["src/content/index.ts"],
      // Intentionally no top-level "css" entry: a manifest-level content
      // script stylesheet is injected straight into the host page's own
      // document, unscoped, where it would both leak onto the merchant's
      // page and fail to apply :host rules (those only resolve inside an
      // actual shadow root). overlay.css is instead imported as a string
      // (Vite's `?inline` loader, see overlay/mount.ts) and attached
      // directly inside the overlay's own shadow root.
      run_at: "document_idle",
      all_frames: false,
    },
  ],
  permissions: ["storage", "activeTab", "scripting"],
  host_permissions: [...MERCHANT_MATCHES, ...BACKEND_HOST_PERMISSIONS],
  web_accessible_resources: [
    {
      resources: ["public/icons/*.png"],
      matches: MERCHANT_MATCHES,
    },
  ],
});
