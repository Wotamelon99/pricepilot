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
  it("reads title, image, price and currency from og/product meta tags on a product page", () => {
    const doc = docWithMeta([
      ["og:type", "product"],
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

  it("ignores og:title on a non-product page, even with document.title set", () => {
    // Regression test: a page's og:title (or, before this was fixed, even
    // the plain <title> tag as a last-resort fallback) is not itself
    // evidence of being a product page - every page has one of these,
    // including a homepage or category listing. Without gating on
    // og:type=product, any such page was misdetected as "a product",
    // popping the comparison overlay where there was nothing to compare.
    const doc = docWithMeta([["og:title", "Amazon.de: Günstige Preise für Elektronik & mehr"]]);
    doc.title = "Amazon.de: Günstige Preise für Elektronik & mehr";
    const result = extractOpenGraphProduct(doc);
    expect(result.title).toBeUndefined();
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
