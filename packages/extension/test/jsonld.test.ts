import { describe, expect, it } from "vitest";
import { extractJsonLdProduct } from "../src/content/extraction/jsonld.js";

function docWithJsonLd(json: unknown): Document {
  const doc = document.implementation.createHTMLDocument("test");
  const script = doc.createElement("script");
  script.type = "application/ld+json";
  script.textContent = JSON.stringify(json);
  doc.head.appendChild(script);
  return doc;
}

describe("extractJsonLdProduct", () => {
  it("extracts a well-formed Product node", () => {
    const doc = docWithJsonLd({
      "@context": "https://schema.org",
      "@type": "Product",
      name: "Samsung 990 Pro 2TB",
      gtin13: "8806094967747",
      brand: { "@type": "Brand", name: "Samsung" },
      offers: { "@type": "Offer", price: "159.00", priceCurrency: "EUR" },
    });

    const product = extractJsonLdProduct(doc);
    expect(product).toBeDefined();
    expect(product?.name).toBe("Samsung 990 Pro 2TB");
    expect(product?.gtin13).toBe("8806094967747");
    expect(product?.brand).toBe("Samsung");
    expect(product?.price).toBeCloseTo(159, 2);
    expect(product?.priceCurrency).toBe("EUR");
  });

  it("finds a Product node inside an @graph array", () => {
    const doc = docWithJsonLd({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "WebPage", name: "Some page" },
        { "@type": "Product", name: "AMD Ryzen 7 9800X3D", mpn: "100-100001084WOF" },
      ],
    });

    const product = extractJsonLdProduct(doc);
    expect(product?.name).toBe("AMD Ryzen 7 9800X3D");
    expect(product?.mpn).toBe("100-100001084WOF");
  });

  it("handles a brand given as a plain string", () => {
    const doc = docWithJsonLd({ "@type": "Product", name: "Test", brand: "Kingston" });
    expect(extractJsonLdProduct(doc)?.brand).toBe("Kingston");
  });

  it("returns undefined when no Product node is present", () => {
    const doc = docWithJsonLd({ "@type": "WebPage", name: "Not a product" });
    expect(extractJsonLdProduct(doc)).toBeUndefined();
  });

  it("skips malformed JSON-LD without throwing", () => {
    const doc = document.implementation.createHTMLDocument("test");
    const script = doc.createElement("script");
    script.type = "application/ld+json";
    script.textContent = "{ this is not valid json ";
    doc.head.appendChild(script);

    expect(() => extractJsonLdProduct(doc)).not.toThrow();
    expect(extractJsonLdProduct(doc)).toBeUndefined();
  });

  it("returns undefined when the document has no JSON-LD at all", () => {
    const doc = document.implementation.createHTMLDocument("test");
    expect(extractJsonLdProduct(doc)).toBeUndefined();
  });
});
