import type { FastifyInstance } from "fastify";
import { pool } from "../db/pool.js";
import { providerRegistry } from "../providers/registry.js";

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/metrics", async (_request, reply) => {
    const [clickCountResult, errorCountResult] = await Promise.all([
      pool.query<{ count: string }>("SELECT count(*)::text AS count FROM click_events"),
      pool.query<{ count: string }>("SELECT count(*)::text AS count FROM provider_errors"),
    ]);

    const providers = providerRegistry.all().map((p) => ({
      providerId: p.providerId,
      displayName: p.displayName,
      configured: p.isConfigured(),
    }));

    return reply.send({
      totalClicks: Number(clickCountResult.rows[0]?.count ?? 0),
      totalProviderErrors: Number(errorCountResult.rows[0]?.count ?? 0),
      providers,
      generatedAt: new Date().toISOString(),
    });
  });
}
