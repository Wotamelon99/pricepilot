import { describe, expect, it } from "vitest";
import {
  computeTotalPrice,
  normalizeTitle,
  sortByTotalPriceAscending,
} from "../src/matching/normalize.js";
import type { Offer } from "../src/providers/types.js";

describe("normalizeTitle", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalizeTitle("NVIDIA GeForce RTX 5070 (12GB, GDDR7)!")).toBe(
      "nvidia geforce rtx 5070 12gb gddr7",
    );
  });

  it("folds diacritics", () => {
    expect(normalizeTitle("Prozessor für Übertaktung")).toBe("prozessor fur ubertaktung");
  });
});

describe("computeTotalPrice", () => {
  it("adds price and shipping in the same currency", () => {
    const total = computeTotalPrice(
      { amount: 599, currency: "EUR" },
      { amount: 4.99, currency: "EUR" },
    );
    expect(total).toEqual({ amount: 603.99, currency: "EUR" });
  });

  it("rounds to 2 decimal places", () => {
    const total = computeTotalPrice(
      { amount: 10.005, currency: "EUR" },
      { amount: 0.001, currency: "EUR" },
    );
    expect(total.amount).toBeCloseTo(10.01, 2);
  });

  it("throws on mismatched currencies", () => {
    expect(() =>
      computeTotalPrice({ amount: 10, currency: "EUR" }, { amount: 1, currency: "USD" }),
    ).toThrow(/mismatched currencies/);
  });
});

function makeOffer(amount: number, currency = "EUR"): Offer {
  return {
    offerId: `demo_${amount}_${currency}`,
    providerId: "demo",
    merchantName: "Test",
    productTitle: "Test product",
    identity: { title: "Test product" },
    price: { amount, currency },
    shipping: { amount: 0, currency },
    totalPrice: { amount, currency },
    inStock: true,
    productUrl: "https://example.com",
    currency,
    fetchedAt: new Date().toISOString(),
    matchConfidence: 1,
  };
}

describe("sortByTotalPriceAscending", () => {
  it("sorts offers cheapest-first", () => {
    const offers = [makeOffer(300), makeOffer(100), makeOffer(200)];
    const sorted = sortByTotalPriceAscending(offers);
    expect(sorted.map((o) => o.totalPrice.amount)).toEqual([100, 200, 300]);
  });

  it("does not mutate the input array", () => {
    const offers = [makeOffer(300), makeOffer(100)];
    const copy = [...offers];
    sortByTotalPriceAscending(offers);
    expect(offers).toEqual(copy);
  });
});
