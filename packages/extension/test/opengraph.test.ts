import { describe, expect, it } from "vitest";
import { extractOpenGraphProduct } from "../src/content/extraction/opengraph.js";

function docWithMeta(entries: Array<[string, string]>): Document {
  const doc = document.implementation.createHTMLDocument("test");
  for (const [property, content] of entries) {
    const meta = doc.createElement("meta");
    meta.setAttribute("property", property);
    meta.setAttribute("content", content);
    doc.head.appendChild(meta);
  }
  return doc;
}

describe("extractOpenGraphProduct", () => {
  it("reads title, image, price and currency from og/product meta tags", () => {
    const doc = docWithMeta([
      ["og:title", "NVIDIA GeForce RTX 5070"],
      ["og:image", "https://example.com/rtx5070.jpg"],
      ["product:price:amount", "599.00"],
      ["product:price:currency", "EUR"],
      ["product:brand", "NVIDIA"],
    ]);

    const result = extractOpenGraphProduct(doc);
    expect(result.title).toBe("NVIDIA GeForce RTX 5070");
    expect(result.image).toBe("https://example.com/rtx5070.jpg");
    expect(result.priceAmount).toBeCloseTo(599, 2);
    expect(result.priceCurrency).toBe("EUR");
    expect(result.brand).toBe("NVIDIA");
  });

  it("falls back to document.title when og:title is missing", () => {
    const doc = document.implementation.createHTMLDocument("Fallback Title");
    const result = extractOpenGraphProduct(doc);
    expect(result.title).toBe("Fallback Title");
  });

  it("handles a German-formatted price amount with a comma decimal", () => {
    const doc = docWithMeta([["product:price:amount", "159,00"]]);
    expect(extractOpenGraphProduct(doc).priceAmount).toBeCloseTo(159, 2);
  });

  it("returns undefined fields when no relevant meta tags are present", () => {
    const doc = document.implementation.createHTMLDocument("");
    const result = extractOpenGraphProduct(doc);
    expect(result.priceAmount).toBeUndefined();
    expect(result.brand).toBeUndefined();
  });
});
