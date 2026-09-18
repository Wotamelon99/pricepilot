import { describe, expect, it } from "vitest";
import { parseGermanPrice } from "../src/content/extraction/price.js";

describe("parseGermanPrice", () => {
  it("parses simple German decimal-comma prices", () => {
    expect(parseGermanPrice("39,99€")).toBeCloseTo(39.99, 2);
  });

  it("parses German thousands-dot + decimal-comma prices", () => {
    expect(parseGermanPrice("1.234,56 €")).toBeCloseTo(1234.56, 2);
  });

  it("parses plain dot-decimal prices", () => {
    expect(parseGermanPrice("€19.99")).toBeCloseTo(19.99, 2);
  });

  it("parses whole-euro prices with no decimals", () => {
    expect(parseGermanPrice("599 €")).toBeCloseTo(599, 2);
  });

  it("returns undefined for text with no digits", () => {
    expect(parseGermanPrice("Preis auf Anfrage")).toBeUndefined();
  });

  it("returns undefined for an empty string", () => {
    expect(parseGermanPrice("")).toBeUndefined();
  });

  it("strips surrounding whitespace and words", () => {
    expect(parseGermanPrice("ab 479,00 €")).toBeCloseTo(479, 2);
  });
});
