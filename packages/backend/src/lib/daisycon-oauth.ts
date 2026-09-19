import { randomBytes, createHash } from "node:crypto";
import { config } from "../config/env.js";
import { cache } from "./cache.js";

/**
 * Daisycon OAuth2 (Authorization Code + PKCE) client.
 *
 * Unlike Awin's single static bearer token, Daisycon requires a one-time
 * interactive browser login to obtain a long-lived refresh token (see
 * https://github.com/DaisyconBV/oauth-examples for Daisycon's own
 * reference implementation, which this mirrors): the publisher logs in at
 * Daisycon's authorize endpoint, gets redirected back to our callback with
 * a short-lived code, and that code is exchanged - together with the PKCE
 * code_verifier - for an access + refresh token pair. From then on, the
 * refresh token (stored as DAISYCON_REFRESH_TOKEN) mints new access
 * tokens automatically, with no further browser interaction.
 */

const AUTHORIZE_URL = "https://login.daisycon.com/oauth/authorize";
const TOKEN_URL = "https://login.daisycon.com/oauth/access-token";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

let cachedAccessToken: { value: string; expiresAt: number } | undefined;

function base64url(input: Buffer): string {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** PKCE pair per the S256 method Daisycon's own oauth-examples use. */
function generatePkcePair(): { verifier: string; challenge: string } {
  const verifier = base64url(randomBytes(64)); // well within the 43-128 char range PKCE requires
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

const PKCE_STATE_CACHE_PREFIX = "daisycon:pkce:";
const PKCE_STATE_TTL_SECONDS = 600; // 10 minutes - plenty for a human to log in

/**
 * Starts the one-time authorization flow: generates a PKCE pair, stashes
 * the verifier (keyed by a random state token) for the callback to pick
 * back up, and returns the URL to send the publisher's browser to.
 */
export async function buildAuthorizeUrl(): Promise<string> {
  if (!config.daisycon.clientId) {
    throw new Error("DAISYCON_CLIENT_ID is not set");
  }

  const state = base64url(randomBytes(24));
  const { verifier, challenge } = generatePkcePair();
  await cache.set(`${PKCE_STATE_CACHE_PREFIX}${state}`, { verifier }, PKCE_STATE_TTL_SECONDS);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", config.daisycon.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", config.daisycon.redirectUri);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return url.toString();
}

/**
 * Completes the flow: exchanges the authorization code (from the
 * callback's `code` query param) for a token pair, using the code_verifier
 * stashed by buildAuthorizeUrl() under the matching `state`.
 *
 * Returns the refresh token so the caller (the callback route) can show it
 * to the publisher to store as DAISYCON_REFRESH_TOKEN - this function
 * itself never persists it anywhere.
 */
export async function exchangeCodeForRefreshToken(code: string, state: string): Promise<string> {
  if (!config.daisycon.clientId || !config.daisycon.clientSecret) {
    throw new Error("DAISYCON_CLIENT_ID / DAISYCON_CLIENT_SECRET are not set");
  }

  const stateKey = `${PKCE_STATE_CACHE_PREFIX}${state}`;
  const stashed = await cache.get<{ verifier: string }>(stateKey);
  if (!stashed) {
    throw new Error("Unknown or expired OAuth state - restart the authorize flow");
  }
  await cache.del(stateKey);

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: config.daisycon.clientId,
      client_secret: config.daisycon.clientSecret,
      redirect_uri: config.daisycon.redirectUri,
      code_verifier: stashed.verifier,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Daisycon token exchange failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as TokenResponse;
  if (!data.refresh_token) {
    throw new Error("Daisycon token response did not include a refresh_token");
  }
  return data.refresh_token;
}

/** Returns a valid access token, refreshing it via the stored refresh token if the cached one has expired. */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt - 30_000 > now) {
    return cachedAccessToken.value;
  }

  if (!config.daisycon.clientId || !config.daisycon.clientSecret || !config.daisycon.refreshToken) {
    throw new Error("Daisycon is not configured (missing client id/secret/refresh token)");
  }

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.daisycon.refreshToken,
      client_id: config.daisycon.clientId,
      client_secret: config.daisycon.clientSecret,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Daisycon token refresh failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const data = (await response.json()) as TokenResponse;
  cachedAccessToken = { value: data.access_token, expiresAt: now + data.expires_in * 1000 };
  return cachedAccessToken.value;
}
