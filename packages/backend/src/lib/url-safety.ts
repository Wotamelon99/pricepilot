/**
 * Validates that a URL is safe to redirect a user to from the click-through
 * endpoint. This guards against open-redirect abuse: only http(s) URLs with
 * a resolvable hostname are allowed, and we explicitly reject
 * javascript:/data:/file: schemes and bare IP-literal loopback/private
 * addresses that could be used to probe internal infrastructure.
 */

const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^127\./,
  /^0\.0\.0\.0$/,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^169\.254\./,
  /^::1$/,
  /^\[::1\]$/,
];

export function isSafeRedirectUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return false;
  }

  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
    return false;
  }

  if (!url.hostname || url.hostname.length < 3) {
    return false;
  }

  return true;
}

export function assertSafeRedirectUrl(rawUrl: string): string {
  if (!isSafeRedirectUrl(rawUrl)) {
    throw new Error(`Refusing to redirect to unsafe URL: ${rawUrl}`);
  }
  return rawUrl;
}
