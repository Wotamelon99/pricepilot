# PricePilot

A 100% free Chrome price-comparison extension for Germany/EU, covering Electronics, PC Hardware, Gaming Hardware, and Computer Accessories. Monetized exclusively through affiliate commissions (Amazon PA-API, Awin) and future non-intrusive sponsorships — never through user paywalls.

This repository is being built incrementally. **Phase 2: Fastify backend + DemoProvider** (`packages/backend`) and **Phase 3: Chrome Extension** (`packages/extension`) are implemented. Real provider adapters (Amazon PA-API / Awin live calls) and production finalization are Phase 4.

## Monorepo layout

```
pricepilot/
├── packages/
│   ├── backend/           # Fastify API server (Phase 2)
│   │   ├── src/
│   │   │   ├── config/       # env loading & validation
│   │   │   ├── db/           # postgres pool + migrations
│   │   │   ├── lib/          # cache, http client, url signing, logger
│   │   │   ├── matching/     # product matching + price normalization
│   │   │   ├── providers/    # PriceProvider interface + DemoProvider
│   │   │   └── routes/       # /health, /api/products/search, /api/offers/:id/click, /admin/metrics
│   │   └── test/          # vitest unit tests
│   └── extension/         # Chrome Extension, Manifest V3 (Phase 3)
│       ├── manifest.config.ts   # MV3 manifest (typed, via @crxjs/vite-plugin)
│       ├── vite.config.ts
│       ├── src/
│       │   ├── background/      # MV3 service worker - the only place that calls the backend
│       │   ├── content/          # content script: product detection + overlay UI
│       │   │   ├── extraction/   # JSON-LD → OpenGraph → per-site DOM selectors
│       │   │   └── overlay/      # Shadow-DOM-mounted React comparison widget
│       │   ├── popup/            # toolbar popup (React)
│       │   ├── options/          # options page (React)
│       │   ├── storage/          # chrome.storage settings + on-device price history
│       │   ├── api/              # backend HTTP client
│       │   └── shared/           # types/messages mirrored from the backend contract
│       └── test/          # vitest + jsdom unit tests for the extraction logic
├── docker-compose.yml
└── package.json           # npm workspaces root
```

## Architecture principles (see full spec in project history)

- **Provider isolation**: every retailer is an isolated `PriceProvider` implementation behind a shared interface (`searchProduct`, `getProduct`, `generateAffiliateUrl`). The core app never hard-codes Amazon- or Awin-specific behavior outside their own provider modules.
- **Legal data hierarchy**: Official APIs → Affiliate APIs → Product feeds → Affiliate network feeds → Permitted sources. No scraping that violates a retailer's Terms of Service.
- **Secrets stay server-side**: affiliate credentials live only in the backend `.env` (see `.env.example`); the Chrome extension never receives raw credentials, only signed/normalized offer data and redirect URLs.
- **Provider status**: a provider without configured credentials reports `CONFIGURATION_REQUIRED` rather than crashing or being silently omitted.

## Getting started

### 1. Environment variables

```bash
cd packages/backend
cp .env.example .env
```

`.env.example` already lists the active affiliate IDs used in this project:

```
AMAZON_PARTNER_TAG=pricepilot051-20
AWIN_PUBLISHER_ID=3099235
```

Amazon Creators API and Awin API secrets (credential ID/secret, API token) are **not** included — those are added by whoever owns the credentials and are never committed.

### 2. Run with Docker Compose (recommended)

```bash
docker compose up --build
```

This starts PostgreSQL, Redis, and the backend API on `http://localhost:3000`. Migrations run automatically on backend startup.

### 3. Run locally without Docker

Requires local PostgreSQL and Redis instances reachable at the URLs in `.env`.

```bash
npm install
npm run migrate --workspace=@pricepilot/backend
npm run dev --workspace=@pricepilot/backend
```

### 4. Verify

```bash
curl http://localhost:3000/health
curl -X POST http://localhost:3000/api/products/search -H 'content-type: application/json' -d '{"query":"RTX 5070"}'
```

## Testing & type-checking

```bash
npm run typecheck   # both packages
npm run test        # both packages
# or per-package: npm run typecheck:backend / npm run test:extension / etc.
```

## Chrome extension (Phase 3)

### 1. Install and build

```bash
npm install
npm run build:extension
```

This produces `packages/extension/dist/`.

### 2. Load it in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select `packages/extension/dist/`.
4. Make sure the backend is running (`docker compose up` or `npm run dev` in `packages/backend`) at `http://localhost:3000` - the extension's background worker calls it directly.

For active development with hot reload instead of a full rebuild each time:

```bash
npm run dev:extension
```

Then load the same `dist/` folder as an unpacked extension once; `@crxjs/vite-plugin` handles reloading it as you edit.

### 3. What it does

- **Detection** (`src/content/extraction/`): on a matched product page (Amazon.de, Otto.de, MediaMarkt.de, Saturn.de), the content script tries, in order: schema.org JSON-LD → OpenGraph/meta tags → per-site DOM selectors (`src/content/extraction/sites/`). Whichever layer finds a given field wins; later layers only fill in gaps, never overwrite an earlier hit.
- **Comparison** (`src/background/service-worker.ts`): the content script never calls the backend itself (it runs in the merchant page's own, untrusted context) - it messages the background service worker, which holds the `host_permissions` for the backend origin and calls `POST /api/products/search`.
- **Overlay** (`src/content/overlay/`): a small floating card mounted in its own Shadow DOM root, so the merchant page's CSS can never affect it (and vice versa). Shows the cheapest matched offer(s), potential savings vs. the page's own displayed price, and an affiliate disclosure. Supports light/dark mode via `prefers-color-scheme`.
- **Popup** (`src/popup/`): click the toolbar icon to see the same comparison for the active tab, plus an on-device price-history list and quick settings (overlay on/off, theme).
- **Options page** (`src/options/`): enable/disable individual merchants, change the backend URL (for pointing at a deployed backend instead of `localhost`), and clear the on-device price history.

**Note on price history**: the backend's `price_snapshots` table exists (Phase 2 migration), but no `GET` endpoint exposes it yet — that's backend work for a later phase. Until then, the popup's "Preisverlauf" is built from prices *this browser* has observed locally (`chrome.storage.local`), clearly labeled "auf diesem Gerät" (on this device) so it's never mistaken for true cross-user price history.

**Note on merchant selectors**: the per-site DOM selectors in `src/content/extraction/sites/` (used only as the fallback when a page has no JSON-LD/OpenGraph data) are based on well-documented, long-standing patterns, but retailer markup changes without notice and could not be verified against the live sites from the environment this was built in. Spot-check them against the current DOM before relying on them in production.

## API endpoints (Phase 2)

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness/readiness check (DB + Redis ping) |
| POST | `/api/products/search` | Search for a product by free-text query or identifiers (GTIN/EAN/ASIN/MPN); returns normalized, matched offers sorted by total price (item + shipping) |
| GET | `/api/offers/:offerId/click` | Logs an anonymous click event and 302-redirects to the provider's affiliate URL |
| GET | `/admin/metrics` | Basic operational metrics (search volume, click volume, provider error counts) |

## Legal & compliance notes (draft, expand in Phase 4)

- Affiliate links are disclosed to users in the extension UI before they are followed.
- No personal data is required to use PricePilot; click logging is anonymous (no user accounts required for core price comparison).
- Each provider adapter must document which data source tier it uses (see Data Hierarchy above) and must not violate that retailer's Terms of Service.

## Production finalization (Phase 4, not yet implemented)

- Real Amazon PA-API and Awin adapters (currently registered but report `CONFIGURATION_REQUIRED` - see `packages/backend/src/providers/amazon-provider.ts` / `awin-provider.ts`).
- A `GET` endpoint exposing real price history from `price_snapshots`.
- Admin API hardening/auth, Chrome Web Store listing assets, and finalized Privacy Policy / Affiliate Disclosure drafts.
