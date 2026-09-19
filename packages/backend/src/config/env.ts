import "dotenv/config";

/**
 * Centralized, strictly-typed environment configuration.
 *
 * All affiliate network credentials and other secrets are read ONLY here,
 * server-side. Nothing in this module is ever sent to the Chrome extension.
 */

function requireString(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === "") {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalString(name: string): string | undefined {
  const value = process.env[name];
  return value === undefined || value === "" ? undefined : value;
}

function intWithDefault(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  }
  return parsed;
}

function boolWithDefault(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return raw.toLowerCase() === "true" || raw === "1";
}

export interface AmazonConfig {
  readonly partnerTag: string;
  readonly marketplace: string;
  // Amazon retired PA-API 5.0 (which used an AWS-style access/secret key
  // pair) in favor of the OAuth2-based "Creators API". These are that
  // API's Credential ID / Credential Secret, generated separately at
  // https://affiliate-program.amazon.com/creatorsapi - NOT the same thing
  // as an AWS IAM key pair, even though the field names are similar.
  readonly credentialId: string | undefined;
  readonly credentialSecret: string | undefined;
  readonly apiHost: string;
  /** True only when the credentials needed to call the Creators API are present. */
  readonly isConfigured: boolean;
}

export interface AwinConfig {
  readonly publisherId: string;
  // OAuth2 Bearer token from ui.awin.com/awin-api ("API Credentials").
  // Used against the fixed https://api.awin.com base for both listing
  // joined programmes and downloading each one's product feed - see
  // src/lib/awin-feed-sync.ts. Awin has no live cross-advertiser search
  // API - product data only becomes queryable locally after a feed sync
  // has imported it.
  readonly apiToken: string | undefined;
  readonly region: string;
  readonly isConfigured: boolean;
}

export interface DaisyconConfig {
  readonly publisherId: string | undefined;
  readonly mediaId: string | undefined;
  // OAuth2 (Authorization Code + PKCE) app credentials from a Developer
  // Account under Tools > Daisycon API in the Daisycon publisher UI - see
  // src/lib/daisycon-oauth.ts. Unlike Awin's single static bearer token,
  // Daisycon requires a one-time interactive browser login (via
  // /admin/daisycon/authorize) to obtain a long-lived refresh token, which
  // is then exchanged for short-lived access tokens automatically.
  readonly clientId: string | undefined;
  readonly clientSecret: string | undefined;
  readonly redirectUri: string;
  /** Long-lived; obtained once via the /admin/daisycon/authorize -> /oauth/daisycon/callback flow and then stored here. */
  readonly refreshToken: string | undefined;
  readonly isConfigured: boolean;
}

export interface AppConfig {
  readonly nodeEnv: "development" | "production" | "test";
  readonly port: number;
  readonly host: string;
  readonly logLevel: string;
  readonly publicBaseUrl: string;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly cacheTtlSeconds: number;
  readonly rateLimitMax: number;
  readonly rateLimitWindowMs: number;
  readonly demoProviderEnabled: boolean;
  readonly amazon: AmazonConfig;
  readonly awin: AwinConfig;
  readonly daisycon: DaisyconConfig;
}

function loadConfig(): AppConfig {
  const nodeEnvRaw = process.env["NODE_ENV"] ?? "development";
  const nodeEnv: AppConfig["nodeEnv"] =
    nodeEnvRaw === "production" || nodeEnvRaw === "test" ? nodeEnvRaw : "development";

  // Fall back to the old AMAZON_ACCESS_KEY/AMAZON_SECRET_KEY names for
  // anyone who already set those (from the retired PA-API setup) so
  // switching to the Creators API doesn't silently drop configuration -
  // but AMAZON_CREDENTIAL_ID/AMAZON_CREDENTIAL_SECRET are the names to use.
  const amazonCredentialId =
    optionalString("AMAZON_CREDENTIAL_ID") ?? optionalString("AMAZON_ACCESS_KEY");
  const amazonCredentialSecret =
    optionalString("AMAZON_CREDENTIAL_SECRET") ?? optionalString("AMAZON_SECRET_KEY");
  const amazonPartnerTag = requireString("AMAZON_PARTNER_TAG");

  const awinPublisherId = requireString("AWIN_PUBLISHER_ID");
  const awinApiToken = optionalString("AWIN_API_TOKEN");

  const daisyconClientId = optionalString("DAISYCON_CLIENT_ID");
  const daisyconClientSecret = optionalString("DAISYCON_CLIENT_SECRET");
  const daisyconRefreshToken = optionalString("DAISYCON_REFRESH_TOKEN");

  return {
    nodeEnv,
    port: intWithDefault("PORT", 3000),
    host: process.env["HOST"] ?? "0.0.0.0",
    logLevel: process.env["LOG_LEVEL"] ?? "info",
    publicBaseUrl: process.env["PUBLIC_BASE_URL"] ?? "http://localhost:3000",
    databaseUrl: requireString(
      "DATABASE_URL",
      "postgres://pricepilot:pricepilot@localhost:5432/pricepilot",
    ),
    redisUrl: process.env["REDIS_URL"] ?? "redis://localhost:6379",
    cacheTtlSeconds: intWithDefault("CACHE_TTL_SECONDS", 900),
    rateLimitMax: intWithDefault("RATE_LIMIT_MAX", 100),
    rateLimitWindowMs: intWithDefault("RATE_LIMIT_WINDOW_MS", 60_000),
    demoProviderEnabled: boolWithDefault("DEMO_PROVIDER_ENABLED", true),
    amazon: {
      partnerTag: amazonPartnerTag,
      marketplace: process.env["AMAZON_MARKETPLACE"] ?? "www.amazon.de",
      credentialId: amazonCredentialId,
      credentialSecret: amazonCredentialSecret,
      apiHost: process.env["AMAZON_CREATORS_API_HOST"] ?? "creatorsapi.amazon",
      isConfigured: Boolean(amazonCredentialId && amazonCredentialSecret && amazonPartnerTag),
    },
    awin: {
      publisherId: awinPublisherId,
      apiToken: awinApiToken,
      region: process.env["AWIN_REGION"] ?? "DE",
      isConfigured: Boolean(awinApiToken && awinPublisherId),
    },
    daisycon: {
      publisherId: optionalString("DAISYCON_PUBLISHER_ID"),
      mediaId: optionalString("DAISYCON_MEDIA_ID"),
      clientId: daisyconClientId,
      clientSecret: daisyconClientSecret,
      redirectUri:
        process.env["DAISYCON_REDIRECT_URI"] ??
        `${process.env["PUBLIC_BASE_URL"] ?? "http://localhost:3000"}/oauth/daisycon/callback`,
      refreshToken: daisyconRefreshToken,
      isConfigured: Boolean(daisyconClientId && daisyconClientSecret && daisyconRefreshToken),
    },
  };
}

export const config: AppConfig = loadConfig();
