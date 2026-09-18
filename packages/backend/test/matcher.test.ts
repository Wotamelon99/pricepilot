import { describe, expect, it } from "vitest";
import { matchIdentities, clusterOffersByProduct, variantsCompatible } from "../src/matching/matcher.js";
import type { Offer, ProductIdentity } from "../src/providers/types.js";

// ProductIdentity's optional fields are typed `T | undefined` (see
// providers/types.ts), so a plain Partial<ProductIdentity> already permits
// assigning `undefined` explicitly (as several tests below do, e.g.
// `ean: undefined`, to clear a default) without widening `title` - Partial
// only adds `?` to `title`, it doesn't add `| undefined` to its value type.
function makeIdentity(overrides: Partial<ProductIdentity> = {}): ProductIdentity {
  return {
    title: "Samsung 990 Pro 2TB NVMe SSD",
    brand: "Samsung",
    mpn: "MZ-V9P2T0BW",
    ean: "8806094967747",
    ...overrides,
  };
}

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    offerId: `demo_${Math.random()}`,
    providerId: "demo",
    merchantName: "Mindfactory",
    productTitle: "Samsung 990 Pro 2TB NVMe SSD",
    identity: makeIdentity(),
    price: { amount: 150, currency: "EUR" },
    shipping: { amount: 5, currency: "EUR" },
    totalPrice: { amount: 155, currency: "EUR" },
    inStock: true,
    productUrl: "https://example.com/product",
    currency: "EUR",
    fetchedAt: new Date().toISOString(),
    matchConfidence: 1,
    ...overrides,
  };
}

describe("matchIdentities", () => {
  it("matches on GTIN/EAN with highest confidence", () => {
    const a = makeIdentity({ ean: "8806094967747" });
    const b = makeIdentity({ ean: "8806094967747", title: "Different title entirely" });
    const result = matchIdentities(a, b);
    expect(result.tier).toBe("GTIN_EAN");
    expect(result.isMatch).toBe(true);
    expect(result.confidence).toBeGreaterThan(0.95);
  });

  it("matches on MPN+Brand when no shared GTIN", () => {
    const a = makeIdentity({ ean: undefined, mpn: "ABC123", brand: "Kingston" });
    const b = makeIdentity({ ean: undefined, mpn: "abc123", brand: "kingston", title: "Other" });
    const result = matchIdentities(a, b);
    expect(result.tier).toBe("MPN_BRAND");
    expect(result.isMatch).toBe(true);
  });

  it("matches on ASIN when no GTIN or MPN+brand match", () => {
    const a = makeIdentity({ ean: undefined, mpn: undefined, brand: undefined, asin: "B0DEMORTX5070" });
    const b = makeIdentity({ ean: undefined, mpn: undefined, brand: undefined, asin: "B0DEMORTX5070", title: "x" });
    const result = matchIdentities(a, b);
    expect(result.tier).toBe("ASIN");
  });

  it("matches on SKU as a fallback below ASIN", () => {
    const a = makeIdentity({ ean: undefined, mpn: undefined, brand: undefined, sku: "SKU-1" });
    const b = makeIdentity({ ean: undefined, mpn: undefined, brand: undefined, sku: "sku-1", title: "x" });
    const result = matchIdentities(a, b);
    expect(result.tier).toBe("SKU");
  });

  it("falls back to normalized title similarity when no strong identifier matches", () => {
    const a = makeIdentity({
      ean: undefined,
      mpn: undefined,
      brand: undefined,
      title: "AMD Ryzen 7 9800X3D Prozessor AM5",
    });
    const b = makeIdentity({
      ean: undefined,
      mpn: undefined,
      brand: undefined,
      title: "AMD Ryzen 7 9800X3D Prozessor (AM5, Boxed)",
    });
    const result = matchIdentities(a, b);
    expect(result.tier).toBe("NORMALIZED_TITLE");
    expect(result.isMatch).toBe(true);
  });

  it("does not match unrelated products", () => {
    const a = makeIdentity({ title: "NVIDIA GeForce RTX 5070", ean: "1", mpn: undefined, brand: undefined });
    const b = makeIdentity({ title: "Kingston FURY Beast 32GB DDR5", ean: "2", mpn: undefined, brand: undefined });
    const result = matchIdentities(a, b);
    expect(result.isMatch).toBe(false);
    expect(result.tier).toBe("NONE");
  });

  it("refuses to match same GTIN with conflicting variant (storage)", () => {
    const a = makeIdentity({ ean: "same-gtin" });
    const b = makeIdentity({ ean: "same-gtin" });
    const result = matchIdentities(a, b, { storageGb: 1000 }, { storageGb: 2000 });
    expect(result.isMatch).toBe(false);
  });

  it("refuses to match new vs refurbished even with identical GTIN", () => {
    const a = makeIdentity({ ean: "same-gtin-2" });
    const b = makeIdentity({ ean: "same-gtin-2" });
    const result = matchIdentities(a, b, { condition: "new" }, { condition: "refurbished" });
    expect(result.isMatch).toBe(false);
  });

  it("allows match when variant attributes are simply absent on one side", () => {
    const a = makeIdentity({ ean: "same-gtin-3" });
    const b = makeIdentity({ ean: "same-gtin-3" });
    const result = matchIdentities(a, b, { ramGb: 32 }, undefined);
    expect(result.isMatch).toBe(true);
  });
});

describe("variantsCompatible", () => {
  it("treats undefined variants as compatible", () => {
    expect(variantsCompatible(undefined, undefined)).toBe(true);
  });

  it("flags a color conflict", () => {
    expect(variantsCompatible({ color: "black" }, { color: "white" })).toBe(false);
  });

  it("allows matching colors regardless of case", () => {
    expect(variantsCompatible({ color: "Black" }, { color: "black" })).toBe(true);
  });
});

describe("clusterOffersByProduct", () => {
  it("groups offers for the same product across merchants", () => {
    const offers = [
      makeOffer({ merchantName: "Mindfactory" }),
      makeOffer({ merchantName: "Alternate" }),
      makeOffer({
        merchantName: "OtherStore",
        // Must also clear brand/mpn (not just ean/title): makeIdentity()'s
        // defaults carry brand "Samsung" + mpn "MZ-V9P2T0BW", and the
        // MPN_BRAND tier outranks title dissimilarity, so leaving them in
        // place would spuriously match this "different product" into the
        // same cluster as the first two offers.
        identity: makeIdentity({
          ean: "different-ean",
          brand: undefined,
          mpn: undefined,
          title: "Totally different product",
        }),
        productTitle: "Totally different product",
      }),
    ];

    const clusters = clusterOffersByProduct(offers);
    expect(clusters).toHaveLength(2);
    const sizes = clusters.map((c) => c.length).sort((a, b) => a - b);
    expect(sizes).toEqual([1, 2]);
  });

  it("keeps refurbished and new offers of the same GTIN in separate clusters", () => {
    const offers = [
      makeOffer({ variant: { condition: "new" } }),
      makeOffer({ variant: { condition: "refurbished" }, merchantName: "RefurbStore" }),
    ];
    const clusters = clusterOffersByProduct(offers);
    expect(clusters).toHaveLength(2);
  });
});
