import type { Offer, ProductIdentity, ProductVariant } from "../providers/types.js";
import { normalizeTitle } from "./normalize.js";

/**
 * Product matching engine.
 *
 * Matches offers to the same underlying physical product using a strict
 * priority hierarchy of identity signals, falling back to normalized-title
 * similarity only when no strong identifier is available. Variant
 * attributes (RAM, storage, color, condition) are always checked last and
 * will veto an otherwise-strong identity match - two offers for the same
 * GTIN but different storage capacities, or new vs. refurbished, must
 * never be merged.
 */

export type MatchTier =
  | "GTIN_EAN"
  | "MPN_BRAND"
  | "ASIN"
  | "SKU"
  | "NORMALIZED_TITLE"
  | "NONE";

export interface MatchResult {
  readonly tier: MatchTier;
  readonly confidence: number;
  readonly isMatch: boolean;
}

const TIER_CONFIDENCE: Record<Exclude<MatchTier, "NONE">, number> = {
  GTIN_EAN: 0.99,
  MPN_BRAND: 0.9,
  ASIN: 0.85,
  SKU: 0.75,
  NORMALIZED_TITLE: 0.55,
};

/** Minimum Jaccard token-overlap ratio for two titles to be considered a fuzzy match. */
const TITLE_SIMILARITY_THRESHOLD = 0.6;

function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(normalizeTitle(a).split(" ").filter(Boolean));
  const setB = new Set(normalizeTitle(b).split(" ").filter(Boolean));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const token of setA) {
    if (setB.has(token)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Returns true if two variants are compatible, i.e. neither specifies a
 * conflicting value for the same attribute. Missing/undefined attributes
 * never block a match - only an explicit conflict does.
 */
export function variantsCompatible(
  a: ProductVariant | undefined,
  b: ProductVariant | undefined,
): boolean {
  if (!a || !b) return true;
  if (a.storageGb !== undefined && b.storageGb !== undefined && a.storageGb !== b.storageGb) {
    return false;
  }
  if (a.ramGb !== undefined && b.ramGb !== undefined && a.ramGb !== b.ramGb) {
    return false;
  }
  if (
    a.color !== undefined &&
    b.color !== undefined &&
    a.color.toLowerCase() !== b.color.toLowerCase()
  ) {
    return false;
  }
  if (a.condition !== undefined && b.condition !== undefined && a.condition !== b.condition) {
    return false;
  }
  return true;
}

/**
 * Compares two ProductIdentity records and returns the strongest matching
 * tier found, per the documented priority hierarchy:
 * GTIN/EAN > MPN+Brand > ASIN > SKU > normalized title.
 */
export function matchIdentities(
  a: ProductIdentity,
  b: ProductIdentity,
  variantA?: ProductVariant,
  variantB?: ProductVariant,
): MatchResult {
  if (!variantsCompatible(variantA, variantB)) {
    return { tier: "NONE", confidence: 0, isMatch: false };
  }

  const aGtin = a.gtin ?? a.ean ?? a.upc;
  const bGtin = b.gtin ?? b.ean ?? b.upc;
  if (aGtin && bGtin && aGtin === bGtin) {
    return { tier: "GTIN_EAN", confidence: TIER_CONFIDENCE.GTIN_EAN, isMatch: true };
  }

  if (
    a.mpn &&
    b.mpn &&
    a.brand &&
    b.brand &&
    a.mpn.toLowerCase() === b.mpn.toLowerCase() &&
    a.brand.toLowerCase() === b.brand.toLowerCase()
  ) {
    return { tier: "MPN_BRAND", confidence: TIER_CONFIDENCE.MPN_BRAND, isMatch: true };
  }

  if (a.asin && b.asin && a.asin === b.asin) {
    return { tier: "ASIN", confidence: TIER_CONFIDENCE.ASIN, isMatch: true };
  }

  if (a.sku && b.sku && a.sku.toLowerCase() === b.sku.toLowerCase()) {
    return { tier: "SKU", confidence: TIER_CONFIDENCE.SKU, isMatch: true };
  }

  const similarity = jaccardSimilarity(a.title, b.title);
  if (similarity >= TITLE_SIMILARITY_THRESHOLD) {
    // Scale confidence within the normalized-title tier by how close the
    // similarity is, so a 0.6 overlap and a 0.95 overlap aren't reported
    // identically.
    const scaled = TIER_CONFIDENCE.NORMALIZED_TITLE * (0.7 + 0.3 * similarity);
    return {
      tier: "NORMALIZED_TITLE",
      confidence: Math.min(scaled, 0.7),
      isMatch: true,
    };
  }

  return { tier: "NONE", confidence: 0, isMatch: false };
}

/**
 * Groups a flat list of offers (potentially from multiple providers) into
 * clusters that represent the same physical product, using the best
 * pairwise match against each cluster's representative (first) offer.
 */
export function clusterOffersByProduct(offers: readonly Offer[]): Offer[][] {
  const clusters: Offer[][] = [];

  for (const offer of offers) {
    let placed = false;
    for (const cluster of clusters) {
      const representative = cluster[0];
      if (!representative) continue;
      const result = matchIdentities(
        offer.identity,
        representative.identity,
        offer.variant,
        representative.variant,
      );
      if (result.isMatch) {
        cluster.push(offer);
        placed = true;
        break;
      }
    }
    if (!placed) {
      clusters.push([offer]);
    }
  }

  return clusters;
}
