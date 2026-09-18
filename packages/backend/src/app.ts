import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import { config } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { healthRoutes } from "./routes/health.js";
import { searchRoutes } from "./routes/search.js";
import { clickRoutes } from "./routes/click.js";
import { adminRoutes } from "./routes/admin.js";
import { providerRegistry } from "./providers/registry.js";
import { DemoProvider } from "./providers/demo-provider.js";
import { AmazonProvider } from "./providers/amazon-provider.js";
import { AwinProvider } from "./providers/awin-provider.js";

export function registerProviders(): void {
  // Idempotent guard for test suites that build the app multiple times.
  if (providerRegistry.all().length > 0) return;
  providerRegistry.register(new DemoProvider());
  providerRegistry.register(new AmazonProvider());
  providerRegistry.register(new AwinProvider());
}

export async function buildApp(): Promise<FastifyInstance> {
  // Fastify v5 renamed the option for passing an already-built logger
  // instance to `loggerInstance` - `logger` now only accepts boolean/options
  // for Fastify to build its own pino instance internally. Passing our
  // shared `logger` (see lib/logger.ts) as `logger` no longer type-checks.
  //
  // The cast to FastifyBaseLogger is needed because Fastify's own logger
  // generic would otherwise be inferred as our concrete pino Logger<never,
  // boolean> type, which is incompatible with the plain `FastifyInstance`
  // type used everywhere else in this codebase (route files, server.ts) -
  // pino's Logger has a `msgPrefix` getter that FastifyBaseLogger's own
  // interface doesn't declare. Our logger instance still satisfies every
  // member FastifyBaseLogger actually requires (info/warn/error/etc.), so
  // this is a safe widening cast, not a behavior change.
  const app = Fastify({ loggerInstance: logger as FastifyBaseLogger });

  registerProviders();

  await app.register(sensible);
  await app.register(rateLimit, {
    max: config.rateLimitMax,
    timeWindow: config.rateLimitWindowMs,
  });

  await app.register(healthRoutes);
  await app.register(searchRoutes);
  await app.register(clickRoutes);
  await app.register(adminRoutes);

  return app;
}
