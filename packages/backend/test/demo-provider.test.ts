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

  it("does not match a different, cheaper variant that shares generic words", async () => {
    // Regression test: "Samsung SSD 990" (the plain, cheaper model) is a
    // different, real product from the catalog's "Samsung 990 Pro 2TB" -
    // they share enough generic words (Samsung, SSD, NVMe, PCIe, 4.0) to
    // look like a match on word-overlap alone, but showing the Pro's
    // prices for the non-Pro product would be a real accuracy bug.
    const provider = new DemoProvider();
    const result = await provider.searchProduct({
      text: "Samsung SSD 990, Interne M.2 NVMe SSD Festplatte, 2TB, PCIe 4.0 x4",
    });
    expect(result.offers).toHaveLength(0);
  });

  it("does not match the same model at a different, unlisted capacity", async () => {
    // Regression test: a real "Samsung 990 PRO 1TB" page is genuinely a
    // 990 Pro, but at a different capacity - and therefore a different
    // real price - than the catalog's 990 Pro *2TB* entry. Treating
    // capacity as optional made this match too, showing 2TB demo prices
    // for a 1TB product.
    const provider = new DemoProvider();
    const result = await provider.searchProduct({
      text: "Samsung 990 PRO NVMe M.2 SSD, 1 TB, PCIe 4.0, Interne SSD für Gaming, MZ-V9P1T0BW",
    });
    expect(result.offers).toHaveLength(0);
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
    const search = await provider.searchProduct({ text: "Samsung 990 Pro 2TB" });
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
    const result = await provider.searchProduct({ text: "Kingston FURY Beast 32GB DDR5-6000" });
    for (const offer of result.offers) {
      const expectedTotal = Math.round((offer.price.amount + offer.shipping.amount) * 100) / 100;
      expect(offer.totalPrice.amount).toBeCloseTo(expectedTotal, 2);
    }
  });
});
