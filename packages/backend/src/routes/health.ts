import type { FastifyInstance } from "fastify";
import { pingDatabase } from "../db/pool.js";
import { cache } from "../lib/cache.js";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health", async (_request, reply) => {
    const [dbOk, redisOk] = await Promise.all([pingDatabase(), cache.ping()]);
    const healthy = dbOk && redisOk;

    const body = {
      status: healthy ? "ok" : "degraded",
      checks: {
        database: dbOk ? "ok" : "unreachable",
        redis: redisOk ? "ok" : "unreachable",
      },
      timestamp: new Date().toISOString(),
    };

    return reply.status(healthy ? 200 : 503).send(body);
  });
}
