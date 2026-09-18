import { describe, expect, it } from "vitest";
import { DemoProvider } from "../src/providers/demo-provider.js";

describe("DemoProvider", () => {
  it("is configured by default (demo always available)", () => {
    const provider = new DemoProvider();
    expect(provider.isConfigured()).toBe(true);
  });

  it("returns matching offers for a known product query", async () => {
    const provider = new DemoProvider();
    const result = await provider.searchProduct({ text: "RTX 5070" });
    expect(result.status).toBe("OK");
    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.offers.every((o) => o.productTitle.includes("RTX 5070"))).toBe(true);
  });

  it("returns offers across multiple merchants for the Ryzen 7 9800X3D", async () => {
    const provider = new DemoProvider();
    const result = await provider.searchProduct({ text: "Ryzen 7 9800X3D" });
    const merchants = new Set(result.offers.map((o) => o.merchantName));
    expect(merchants.size).toBeGreaterThanOrEqual(3);
  });

  it("returns empty results for an unmatched query", async () => {
    const provider = new DemoProvider();
    const result = await provider.searchProduct({ text: "totally nonexistent gizmo 12345" });
    expect(result.status).toBe("OK");
    expect(result.offers).toHaveLength(0);
  });

  it("matches by EAN", async () => {
    const provider = new DemoProvider();
    const result = await provider.searchProduct({ ean: "8806094967747" });
    expect(result.offers.length).toBeGreaterThan(0);
    expect(result.offers.every((o) => o.identity.ean === "8806094967747")).toBe(true);
  });

  it("getProduct returns a previously indexed offer by id", async () => {
    const provider = new DemoProvider();
    const search = await provider.searchProduct({ text: "Samsung 990 Pro" });
    const offerId = search.offers[0]?.offerId;
    expect(offerId).toBeDefined();
    const fetched = await provider.getProduct(offerId as string);
    expect(fetched?.offerId).toBe(offerId);
  });

  it("getProduct returns undefined for unknown offer id", async () => {
    const provider = new DemoProvider();
    const fetched = await provider.getProduct("demo_does-not-exist");
    expect(fetched).toBeUndefined();
  });

  it("computes totalPrice as price + shipping", async () => {
    const provider = new DemoProvider();
    const result = await provider.searchProduct({ text: "Kingston FURY Beast" });
    for (const offer of result.offers) {
      const expectedTotal = Math.round((offer.price.amount + offer.shipping.amount) * 100) / 100;
      expect(offer.totalPrice.amount).toBeCloseTo(expectedTotal, 2);
    }
  });
});
