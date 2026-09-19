import type { SearchResultGroup } from "./types.js";

function normalizeMerchantToken(value: string): string {
  return value.toLowerCase().replace(/^www\./, "").replace(/[^a-z0-9]/g, "");
}

/**
 * True if this offer's merchant is the very site the user is already
 * looking at. Showing that as one of the "cheaper elsewhere" options is
 * just repeating the price already visible on the page - worse, once a
 * real (non-demo) provider is live, a stale or differently-fetched price
 * for the same site reads as the extension contradicting the page itself.
 */
export function isCurrentSiteOffer(merchantName: string, pageUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(pageUrl).hostname;
  } catch {
    return false;
  }
  const hostToken = normalizeMerchantToken(hostname);
  const merchantToken = normalizeMerchantToken(merchantName);
  return merchantToken.length > 0 && hostToken.includes(merchantToken);
}

/** Drops offers from the current site out of each result group, and drops any group left with none. */
export function excludeCurrentSiteOffers(
  results: readonly SearchResultGroup[],
  pageUrl: string,
): SearchResultGroup[] {
  return results
    .map((group) => ({
      ...group,
      offers: group.offers.filter((offer) => !isCurrentSiteOffer(offer.merchantName, pageUrl)),
    }))
    .filter((group) => group.offers.length > 0);
}
