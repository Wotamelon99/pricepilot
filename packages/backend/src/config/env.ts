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
  readonly accessKey: string | undefined;
  readonly secretKey: string | undefined;
  readonly region: string;
  readonly host: string;
  /** True only when the credentials needed to call PA-API are present. */
  readonly isConfigured: boolean;
}

export interface AwinConfig {
  readonly publisherId: string;
  readonly apiToken: string | undefined;
  readonly region: string;
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
}

function loadConfig(): AppConfig {
  const nodeEnvRaw = process.env["NODE_ENV"] ?? "development";
  const nodeEnv: AppConfig["nodeEnv"] =
    nodeEnvRaw === "production" || nodeEnvRaw === "test" ? nodeEnvRaw : "development";

  const amazonAccessKey = optionalString("AMAZON_ACCESS_KEY");
  const amazonSecretKey = optionalString("AMAZON_SECRET_KEY");
  const amazonPartnerTag = requireString("AMAZON_PARTNER_TAG");

  const awinPublisherId = requireString("AWIN_PUBLISHER_ID");
  const awinApiToken = optionalString("AWIN_API_TOKEN");

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
      accessKey: amazonAccessKey,
      secretKey: amazonSecretKey,
      region: process.env["AMAZON_REGION"] ?? "eu-west-1",
      host: process.env["AMAZON_HOST"] ?? "webservices.amazon.de",
      isConfigured: Boolean(amazonAccessKey && amazonSecretKey && amazonPartnerTag),
    },
    awin: {
      publisherId: awinPublisherId,
      apiToken: awinApiToken,
      region: process.env["AWIN_REGION"] ?? "DE",
      isConfigured: Boolean(awinApiToken && awinPublisherId),
    },
  };
}

export const config: AppConfig = loadConfig();
