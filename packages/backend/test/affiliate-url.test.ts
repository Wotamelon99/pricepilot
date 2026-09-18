import { describe, expect, it } from "vitest";
import { AmazonProvider } from "../src/providers/amazon-provider.js";
import { AwinProvider } from "../src/providers/awin-provider.js";
import { DemoProvider } from "../src/providers/demo-provider.js";
import type { Offer } from "../src/providers/types.js";

function makeOffer(productUrl: string): Offer {
  return {
    offerId: "demo_test",
    providerId: "demo",
    merchantName: "TestMerchant",
    productTitle: "Test product",
    identity: { title: "Test product" },
    price: { amount: 100, currency: "EUR" },
    shipping: { amount: 0, currency: "EUR" },
    totalPrice: { amount: 100, currency: "EUR" },
    inStock: true,
    productUrl,
    currency: "EUR",
    fetchedAt: new Date().toISOString(),
    matchConfidence: 1,
  };
}

describe("AmazonProvider.generateAffiliateUrl", () => {
  it("appends the configured partner tag as a query parameter", () => {
    const provider = new AmazonProvider();
    const url = provider.generateAffiliateUrl(makeOffer("https://www.amazon.de/dp/B0TEST12345"));
    const parsed = new URL(url);
    expect(parsed.searchParams.get("tag")).toBe("pricepilot051-20");
    expect(parsed.hostname).toBe("www.amazon.de");
  });
});

describe("AwinProvider.generateAffiliateUrl", () => {
  it("builds a cread.php deep link containing the publisher id and destination", () => {
    const provider = new AwinProvider();
    const url = provider.generateAffiliateUrl(makeOffer("https://www.example-shop.de/product/123"));
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.awin1.com");
    expect(parsed.searchParams.get("awinaffid")).toBe("3099235");
    expect(decodeURIComponent(parsed.searchParams.get("p") ?? "")).toBe(
      "https://www.example-shop.de/product/123",
    );
  });
});

describe("DemoProvider.generateAffiliateUrl", () => {
  it("adds a demo_ref marker without breaking the URL", () => {
    const provider = new DemoProvider();
    const url = provider.generateAffiliateUrl(makeOffer("https://demo.pricepilot.local/store/item"));
    const parsed = new URL(url);
    expect(parsed.searchParams.get("demo_ref")).toBe("pricepilot");
  });
});
