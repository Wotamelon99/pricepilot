import { describe, expect, it } from "vitest";
import { amazonExtractor } from "../src/content/extraction/sites/amazon.js";

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

describe("amazonExtractor", () => {
  it("extracts the ASIN from a /dp/ URL", () => {
    const doc = makeDoc("<html><body></body></html>");
    const result = amazonExtractor.extract(doc, new URL("https://www.amazon.de/Some-Product/dp/B0C1D2E3F4"));
    expect(result.asin).toBe("B0C1D2E3F4");
  });

  it("extracts the ASIN from a /gp/product/ URL", () => {
    const doc = makeDoc("<html><body></body></html>");
    const result = amazonExtractor.extract(doc, new URL("https://www.amazon.de/gp/product/B0AAAA1111"));
    expect(result.asin).toBe("B0AAAA1111");
  });

  it("falls back to the data-asin attribute when the URL has no ASIN", () => {
    const doc = makeDoc('<html><body><div data-asin="B0FROMATTR1"></div></body></html>');
    const result = amazonExtractor.extract(doc, new URL("https://www.amazon.de/some/other/path"));
    expect(result.asin).toBe("B0FROMATTR1");
  });

  it("extracts the product title from #productTitle", () => {
    const doc = makeDoc('<html><body><span id="productTitle"> Kingston FURY Beast 32GB </span></body></html>');
    const result = amazonExtractor.extract(doc, new URL("https://www.amazon.de/dp/B0TESTRAM01"));
    expect(result.title).toBe("Kingston FURY Beast 32GB");
  });

  it("extracts price from the offscreen price element", () => {
    const doc = makeDoc(`
      <html><body>
        <div id="corePriceDisplay_desktop_feature_div">
          <span class="a-price"><span class="a-offscreen">1.234,56 €</span></span>
        </div>
      </body></html>
    `);
    const result = amazonExtractor.extract(doc, new URL("https://www.amazon.de/dp/B0TESTPRICE"));
    expect(result.priceAmount).toBeCloseTo(1234.56, 2);
    expect(result.priceCurrency).toBe("EUR");
  });

  it("returns no ASIN when neither URL nor DOM provide one", () => {
    const doc = makeDoc("<html><body></body></html>");
    const result = amazonExtractor.extract(doc, new URL("https://www.amazon.de/s?k=test"));
    expect(result.asin).toBeUndefined();
  });
});
