import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { providerRegistry } from "../providers/registry.js";
import { isSafeRedirectUrl } from "../lib/url-safety.js";
import { pool } from "../db/pool.js";
import { logger } from "../lib/logger.js";

interface ClickParams {
  offerId: string;
}

function hashSession(request: { ip: string; headers: Record<string, unknown> }): string {
  // Lightweight, non-reversible-looking session marker for anonymous click
  // deduplication/analytics. Not cryptographically salted PII storage -
  // just enough to group clicks without storing raw IP/UA.
  const ua = typeof request.headers["user-agent"] === "string" ? request.headers["user-agent"] : "";
  return Buffer.from(`${request.ip}:${ua}`).toString("base64url").slice(0, 32);
}

export async function clickRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: ClickParams }>("/api/offers/:offerId/click", async (request, reply) => {
    const { offerId } = request.params;

    // Offer ids are namespaced by provider prefix (e.g. "demo_<uuid>").
    const providerId = offerId.split("_")[0];
    const provider = providerId ? providerRegistry.get(providerId) : undefined;

    if (!provider) {
      return reply.status(404).send({ error: "not_found", message: "Unknown offer id." });
    }

    const offer = await provider.getProduct(offerId);
    if (!offer) {
      return reply.status(404).send({ error: "not_found", message: "Offer not found." });
    }

    const affiliateUrl = provider.generateAffiliateUrl(offer);

    if (!isSafeRedirectUrl(affiliateUrl)) {
      logger.error({ offerId, affiliateUrl }, "refusing unsafe redirect target");
      return reply.status(502).send({ error: "unsafe_redirect", message: "Redirect target rejected." });
    }

    // Log the click anonymously; failures here must never block the redirect.
    try {
      await pool.query(
        `INSERT INTO click_events (id, offer_id, session_hash, referrer_host, user_agent, clicked_at)
         SELECT $1, o.id, $2, $3, $4, now()
         FROM offers o WHERE o.offer_key = $5`,
        [
          randomUUID(),
          hashSession({ ip: request.ip, headers: request.headers as Record<string, unknown> }),
          typeof request.headers["referer"] === "string" ? new URL(request.headers["referer"]).host : null,
          request.headers["user-agent"] ?? null,
          offerId,
        ],
      );
    } catch (err) {
      logger.warn({ err, offerId }, "failed to log click event (non-fatal)");
    }

    return reply.redirect(affiliateUrl, 302);
  });
}
