import { describe, expect, it } from "vitest";
import { detectProduct } from "../src/content/extraction/identity.js";

function makeDoc(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function locationFor(href: string): Location {
  return { href } as Location;
}

describe("detectProduct", () => {
  it("prefers JSON-LD identifiers over DOM-scraped ones", () => {
    const doc = makeDoc(`
      <html><head>
        <script type="application/ld+json">
          ${JSON.stringify({
            "@type": "Product",
            name: "Samsung 990 Pro 2TB NVMe SSD",
            gtin13: "8806094967747",
            brand: { "@type": "Brand", name: "Samsung" },
            offers: { price: "159.00", priceCurrency: "EUR" },
          })}
        </script>
      </head><body>
        <h1 id="productTitle">A different DOM title that should be ignored</h1>
      </body></html>
    `);

    // Amazon ASINs are always exactly 10 alphanumeric characters (see
    // ASIN_URL_PATTERN in sites/amazon.ts), so the fixture URL below must
    // use a real-length ASIN or the site extractor's URL regex won't match.
    const product = detectProduct(doc, locationFor("https://www.amazon.de/dp/B0TESTSSD1"));
    expect(product).toBeDefined();
    expect(product?.identity.title).toBe("Samsung 990 Pro 2TB NVMe SSD");
    expect(product?.identity.ean).toBe("8806094967747");
    expect(product?.identity.brand).toBe("Samsung");
    // ASIN still comes from the Amazon site extractor even though JSON-LD won the title/ean.
    expect(product?.identity.asin).toBe("B0TESTSSD1");
    expect(product?.displayedPrice?.amount).toBeCloseTo(159, 2);
  });

  it("falls back to the Amazon DOM extractor when no JSON-LD/OG data is present", () => {
    const doc = makeDoc(`
      <html><head></head><body>
        <h1 id="productTitle">AMD Ryzen 7 9800X3D Prozessor (AM5, Boxed)</h1>
        <div id="corePriceDisplay_desktop_feature_div">
          <span class="a-price"><span class="a-offscreen">479,00 €</span></span>
        </div>
      </body></html>
    `);

    const product = detectProduct(doc, locationFor("https://www.amazon.de/dp/B0TESTCPU1"));
    expect(product?.identity.title).toBe("AMD Ryzen 7 9800X3D Prozessor (AM5, Boxed)");
    expect(product?.identity.asin).toBe("B0TESTCPU1");
    expect(product?.displayedPrice?.amount).toBeCloseTo(479, 2);
  });

  it("returns undefined when no title can be found anywhere", () => {
    const doc = makeDoc("<html><head></head><body><p>Nothing here.</p></body></html>");
    const product = detectProduct(doc, locationFor("https://www.amazon.de/dp/B0EMPTYPAGE"));
    expect(product).toBeUndefined();
  });

  it("returns undefined identity fields as omitted, not null/undefined-valued keys", () => {
    const doc = makeDoc(`
      <html><head></head><body><h1 id="productTitle">Only a title</h1></body></html>
    `);
    const product = detectProduct(doc, locationFor("https://www.amazon.de/dp/B0ONLYTITLE"));
    expect(product?.identity.ean).toBeUndefined();
    expect("ean" in (product?.identity ?? {})).toBe(false);
  });
});
