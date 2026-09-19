import type { FastifyInstance } from "fastify";
import { buildAuthorizeUrl, exchangeCodeForRefreshToken } from "../lib/daisycon-oauth.js";
import { logger } from "../lib/logger.js";

/**
 * One-time interactive bootstrap for Daisycon's OAuth2 refresh token - see
 * src/lib/daisycon-oauth.ts. Not used by the regular product-sync job,
 * which only needs DAISYCON_REFRESH_TOKEN once it's been obtained here.
 *
 * Flow: an operator visits /admin/daisycon/authorize, logs into Daisycon
 * in the browser that opens, and gets redirected back to
 * /oauth/daisycon/callback with a code - which this exchanges for a
 * refresh token, shown once in the response for the operator to copy into
 * the DAISYCON_REFRESH_TOKEN environment variable. Nothing here persists
 * the token itself; it only ever passes through as a value in an HTTP
 * response the operator reads once.
 */
export async function daisyconOAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/admin/daisycon/authorize", async (_request, reply) => {
    try {
      const url = await buildAuthorizeUrl();
      return reply.redirect(url);
    } catch (err) {
      logger.error({ err }, "failed to build daisycon authorize url");
      return reply.status(500).send({
        error: "daisycon_not_configured",
        message: err instanceof Error ? err.message : "unknown error",
      });
    }
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    "/oauth/daisycon/callback",
    async (request, reply) => {
      const { code, state, error } = request.query;

      if (error) {
        return reply.status(400).send({ error: "daisycon_denied", message: error });
      }
      if (!code || !state) {
        return reply.status(400).send({
          error: "bad_request",
          message: "Missing code or state query parameter.",
        });
      }

      try {
        const refreshToken = await exchangeCodeForRefreshToken(code, state);
        return reply.type("text/html").send(`
          <!doctype html>
          <html lang="de">
            <body style="font-family: system-ui, sans-serif; max-width: 640px; margin: 48px auto; line-height: 1.5;">
              <h1>Daisycon verbunden</h1>
              <p>Trag den folgenden Wert als <code>DAISYCON_REFRESH_TOKEN</code> in die Backend-Konfiguration ein (Render Environment Variables) und lade diese Seite danach nicht erneut - der Code ist bereits verbraucht.</p>
              <pre style="background:#f4f4f4; padding:16px; border-radius:8px; white-space:pre-wrap; word-break:break-all;">${refreshToken}</pre>
            </body>
          </html>
        `);
      } catch (err) {
        logger.error({ err }, "daisycon token exchange failed");
        return reply.status(500).send({
          error: "token_exchange_failed",
          message: err instanceof Error ? err.message : "unknown error",
        });
      }
    },
  );
}
