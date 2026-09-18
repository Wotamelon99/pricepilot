import type { FastifyInstance } from "fastify";
import { providerRegistry } from "../providers/registry.js";
import { clusterOffersByProduct } from "../matching/matcher.js";
import { sortByTotalPriceAscending } from "../matching/normalize.js";
import { cache } from "../lib/cache.js";
import { config } from "../config/env.js";
import { logger } from "../lib/logger.js";
import type { Offer, ProductSearchQuery, ProviderStatus } from "../providers/types.js";

interface SearchRequestBody {
  query?: string;
  gtin?: string;
  ean?: string;
  asin?: string;
  mpn?: string;
  sku?: string;
  brand?: string;
  category?: string;
}

interface SearchResponseGroup {
  product: {
    title: string;
    brand?: string;
    category?: string;
    model?: string;
  };
  cheapestTotal: Offer["totalPrice"];
  offers: Offer[];
}

function buildCacheKey(query: ProductSearchQuery): string {
  return `search:${JSON.stringify(query, Object.keys(query).sort())}`;
}

function isValidQuery(body: SearchRequestBody): boolean {
  return Boolean(
    body.query?.trim() ||
      body.gtin?.trim() ||
      body.ean?.trim() ||
      body.asin?.trim() ||
      body.mpn?.trim() ||
      body.sku?.trim(),
  );
}

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: SearchRequestBody }>("/api/products/search", async (request, reply) => {
    const body = request.body ?? {};

    if (!isValidQuery(body)) {
      return reply.status(400).send({
        error: "bad_request",
        message: "At least one of query, gtin, ean, asin, mpn, or sku is required.",
      });
    }

    const query: ProductSearchQuery = {
      ...(body.query?.trim() ? { text: body.query.trim() } : {}),
      ...(body.gtin?.trim() ? { gtin: body.gtin.trim() } : {}),
      ...(body.ean?.trim() ? { ean: body.ean.trim() } : {}),
      ...(body.asin?.trim() ? { asin: body.asin.trim() } : {}),
      ...(body.mpn?.trim() ? { mpn: body.mpn.trim() } : {}),
      ...(body.sku?.trim() ? { sku: body.sku.trim() } : {}),
      ...(body.brand?.trim() ? { brand: body.brand.trim() } : {}),
      ...(body.category?.trim() ? { category: body.category.trim() } : {}),
    };

    const cacheKey = buildCacheKey(query);

    const { offers, providerStatuses } = await cache.wrap(
      cacheKey,
      async () => {
        const providers = providerRegistry.all();
        const results = await Promise.all(
          providers.map(async (provider) => {
            try {
              return await provider.searchProduct(query);
            } catch (err) {
              logger.error({ err, providerId: provider.providerId }, "provider search failed");
              return {
                status: "ERROR" as ProviderStatus,
                providerId: provider.providerId,
                offers: [],
                error: err instanceof Error ? err.message : "unknown error",
              };
            }
          }),
        );

        const allOffers = results.flatMap((r) => r.offers);
        const statuses = Object.fromEntries(
          results.map((r) => [r.providerId, { status: r.status, error: r.error }]),
        );
        return { offers: allOffers, providerStatuses: statuses };
      },
      config.cacheTtlSeconds,
    );

    const clusters = clusterOffersByProduct(offers);

    const groups: SearchResponseGroup[] = clusters.map((cluster) => {
      const sorted = sortByTotalPriceAscending(cluster);
      const representative = sorted[0]!;
      return {
        product: {
          title: representative.productTitle,
          ...(representative.identity.brand ? { brand: representative.identity.brand } : {}),
          ...(representative.identity.category
            ? { category: representative.identity.category }
            : {}),
          ...(representative.identity.model ? { model: representative.identity.model } : {}),
        },
        cheapestTotal: representative.totalPrice,
        offers: sorted,
      };
    });

    // Sort groups themselves by their cheapest offer, ascending.
    groups.sort((a, b) => a.cheapestTotal.amount - b.cheapestTotal.amount);

    return reply.send({
      query,
      resultCount: groups.length,
      results: groups,
      providerStatuses,
    });
  });
}
