/**
 * Vitest global setup.
 *
 * Ensures required environment variables (normally supplied by a real
 * `.env` file, see `.env.example`) have safe fallback values when the
 * test suite runs in an environment with no `.env` loaded (CI, a fresh
 * checkout, etc.). This file runs before any test file and before
 * `src/config/env.ts` is imported by anything under test, so `loadConfig()`
 * never throws for a missing-but-optional-in-tests variable.
 *
 * These are the same non-secret values documented in `.env.example` -
 * nothing sensitive is hardcoded here. Real secrets (AMAZON_ACCESS_KEY,
 * AMAZON_SECRET_KEY, AWIN_API_TOKEN) are intentionally left unset so
 * provider `isConfigured()` still reports CONFIGURATION_REQUIRED in tests
 * unless a test explicitly opts in.
 */

process.env.NODE_ENV ??= "test";
process.env.PORT ??= "3000";
process.env.HOST ??= "0.0.0.0";
process.env.LOG_LEVEL ??= "silent";

process.env.DATABASE_URL ??= "postgres://pricepilot:pricepilot@localhost:5432/pricepilot_test";
process.env.REDIS_URL ??= "redis://localhost:6379";
process.env.CACHE_TTL_SECONDS ??= "900";

process.env.RATE_LIMIT_MAX ??= "100";
process.env.RATE_LIMIT_WINDOW_MS ??= "60000";
process.env.PUBLIC_BASE_URL ??= "http://localhost:3000";

// Active affiliate IDs (see project spec) - required (non-optional) by
// config/env.ts, so tests must always have a fallback even without .env.
process.env.AMAZON_PARTNER_TAG ??= "pricepilot0b7-21";
process.env.AMAZON_MARKETPLACE ??= "www.amazon.de";
process.env.AMAZON_REGION ??= "eu-west-1";
process.env.AMAZON_HOST ??= "webservices.amazon.de";

process.env.AWIN_PUBLISHER_ID ??= "3099235";
process.env.AWIN_REGION ??= "DE";

process.env.DEMO_PROVIDER_ENABLED ??= "true";
