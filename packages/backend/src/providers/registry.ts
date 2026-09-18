import type { PriceProvider } from "./types.js";
import { logger } from "../lib/logger.js";

/**
 * Central registry of all PriceProvider implementations. Adding a new
 * retailer/affiliate-network is a matter of implementing PriceProvider
 * and registering it here - nothing else in the app needs to change.
 */
export class ProviderRegistry {
  private readonly providers = new Map<string, PriceProvider>();

  register(provider: PriceProvider): void {
    if (this.providers.has(provider.providerId)) {
      throw new Error(`Provider already registered: ${provider.providerId}`);
    }
    this.providers.set(provider.providerId, provider);
    logger.info(
      { providerId: provider.providerId, configured: provider.isConfigured() },
      "provider registered",
    );
  }

  get(providerId: string): PriceProvider | undefined {
    return this.providers.get(providerId);
  }

  all(): PriceProvider[] {
    return [...this.providers.values()];
  }

  configured(): PriceProvider[] {
    return this.all().filter((p) => p.isConfigured());
  }
}

export const providerRegistry = new ProviderRegistry();
