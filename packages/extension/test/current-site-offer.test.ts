import { describe, expect, it } from "vitest";
import { isCurrentSiteOffer, excludeCurrentSiteOffers } from "../src/shared/current-site-offer.js";
import type { SearchResultGroup, Offer } from "../src/shared/types.js";

function makeOffer(merchantName: string): Offer {
  return {
    offerId: `offer-${merchantName}`,
    providerId: "demo",
    merchantName,
    productTitle: "Test product",
    identity: { title: "Test product" },
    price: { amount: 100, currency: "EUR" },
    shipping: { amount: 0, currency: "EUR" },
    totalPrice: { amount: 100, currency: "EUR" },
    inStock: true,
    productUrl: "https://example.com",
    currency: "EUR",
    fetchedAt: new Date().toISOString(),
    matchConfidence: 1,
  };
}

describe("isCurrentSiteOffer", () => {
  it("matches the merchant to the page's own hostname", () => {
    expect(isCurrentSiteOffer("Amazon.de", "https://www.amazon.de/dp/B0TEST")).toBe(true);
  });

  it("does not match a different merchant", () => {
    expect(isCurrentSiteOffer("Cyberport", "https://www.amazon.de/dp/B0TEST")).toBe(false);
  });

  it("is tolerant of spacing/capitalization differences", () => {
    expect(isCurrentSiteOffer("media markt", "https://www.mediamarkt.de/de/product/1")).toBe(true);
  });
});

describe("excludeCurrentSiteOffers", () => {
  it("drops the current site's offer but keeps the others", () => {
    const groups: SearchResultGroup[] = [
      {
        product: { title: "Test product" },
        cheapestTotal: { amount: 100, currency: "EUR" },
        offers: [makeOffer("Amazon.de"), makeOffer("Cyberport"), makeOffer("Alternate")],
      },
    ];
    const result = excludeCurrentSiteOffers(groups, "https://www.amazon.de/dp/B0TEST");
    expect(result[0]?.offers.map((o) => o.merchantName)).toEqual(["Cyberport", "Alternate"]);
  });

  it("drops a group entirely if its only offer was the current site", () => {
    const groups: SearchResultGroup[] = [
      {
        product: { title: "Test product" },
        cheapestTotal: { amount: 100, currency: "EUR" },
        offers: [makeOffer("Amazon.de")],
      },
    ];
    const result = excludeCurrentSiteOffers(groups, "https://www.amazon.de/dp/B0TEST");
    expect(result).toHaveLength(0);
  });
});
