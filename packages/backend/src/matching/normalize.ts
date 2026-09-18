import type { Money, Offer } from "../providers/types.js";

/**
 * Normalizes a title for fuzzy comparison: lowercased, diacritics folded,
 * punctuation stripped, whitespace collapsed.
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Total price = item price + shipping, both must share the same currency. */
export function computeTotalPrice(price: Money, shipping: Money): Money {
  if (price.currency !== shipping.currency) {
    throw new Error(
      `Cannot combine mismatched currencies: ${price.currency} vs ${shipping.currency}`,
    );
  }
  const amount = Math.round((price.amount + shipping.amount) * 100) / 100;
  return { amount, currency: price.currency };
}

/** Sorts offers ascending by total price (item + shipping), cheapest first. */
export function sortByTotalPriceAscending(offers: readonly Offer[]): Offer[] {
  return [...offers].sort((a, b) => {
    if (a.totalPrice.currency !== b.totalPrice.currency) {
      // Offers in different currencies cannot be compared numerically here;
      // stable-sort them after same-currency offers rather than throwing,
      // since a mixed-currency result set can legitimately occur before
      // FX normalization is added.
      return a.totalPrice.currency.localeCompare(b.totalPrice.currency);
    }
    return a.totalPrice.amount - b.totalPrice.amount;
  });
}

export function formatMoney(money: Money, locale = "de-DE"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency: money.currency }).format(
    money.amount,
  );
}
