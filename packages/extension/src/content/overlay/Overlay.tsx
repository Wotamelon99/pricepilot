import { useEffect, useState } from "react";
import type { DetectedProduct, Money, SearchResponse } from "../../shared/types.js";
import { buildClickUrl } from "../../api/backend-client.js";
import { getSettings } from "../../storage/settings.js";
import { productHistoryKey, recordPricePoint } from "../../storage/price-history.js";
import { excludeCurrentSiteOffers } from "../../shared/current-site-offer.js";

export interface OverlayProps {
  readonly product: DetectedProduct;
  readonly onClose: () => void;
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "empty" }
  | { status: "ready"; data: SearchResponse };

function formatMoney(money: Money): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: money.currency }).format(
    money.amount,
  );
}


export function Overlay({ product, onClose }: OverlayProps): JSX.Element | null {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [backendBaseUrl, setBackendBaseUrl] = useState<string>("https://pricepilot-r9y2.onrender.com");

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const settings = await getSettings();
      if (cancelled) return;
      setBackendBaseUrl(settings.backendBaseUrl);

      chrome.runtime.sendMessage(
        { type: "pricepilot:search", product },
        (response: { ok: boolean; data?: SearchResponse; error?: string } | undefined) => {
          if (cancelled) return;

          if (chrome.runtime.lastError || !response) {
            setState({
              status: "error",
              message: chrome.runtime.lastError?.message ?? "No response from PricePilot.",
            });
            return;
          }

          if (!response.ok || !response.data) {
            setState({ status: "error", message: response.error ?? "Search failed." });
            return;
          }

          // Drop offers from the very site the user is already on, and
          // any result group that leaves empty - see current-site-offer.ts.
          const filteredResults = excludeCurrentSiteOffers(response.data.results, product.pageUrl);

          if (filteredResults.length === 0) {
            setState({ status: "empty" });
            return;
          }

          setState({ status: "ready", data: { ...response.data, results: filteredResults } });

          const best = filteredResults[0];
          const bestOffer = best?.offers[0];
          if (best && bestOffer) {
            void recordPricePoint(productHistoryKey(product.identity), {
              totalPrice: bestOffer.totalPrice,
              merchantName: bestOffer.merchantName,
            });
          }
        },
      );
    })();

    return () => {
      cancelled = true;
    };
    // product identity fields are the real dependency; re-running per
    // detectProduct() call (new object each time) is intentional.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.pageUrl]);

  if (state.status === "loading") {
    return (
      <div className="pp-root">
        <div className="pp-card">
          <Header onClose={onClose} />
          <div className="pp-body">
            <div className="pp-loading">Suche günstigere Angebote…</div>
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="pp-root">
        <div className="pp-card">
          <Header onClose={onClose} />
          <div className="pp-body">
            <div className="pp-error">PricePilot konnte den Preisvergleich nicht laden: {state.message}</div>
            <Disclosure />
          </div>
        </div>
      </div>
    );
  }

  if (state.status === "empty") {
    return (
      <div className="pp-root">
        <div className="pp-card">
          <Header onClose={onClose} />
          <div className="pp-body">
            <div className="pp-empty">Für dieses Produkt wurden noch keine Vergleichsangebote gefunden.</div>
            <Disclosure />
          </div>
        </div>
      </div>
    );
  }

  const group = state.data.results[0];
  if (!group) return null;

  const displayedTotal = product.displayedPrice;
  // Not group.cheapestTotal: that's computed server-side over the
  // *unfiltered* offers, and could be the current-site offer we just
  // filtered out above. group.offers is still cheapest-first after
  // filtering, so its own first entry is the right reference now.
  const cheapest = group.offers[0]?.totalPrice ?? group.cheapestTotal;
  const savings =
    displayedTotal && displayedTotal.currency === cheapest.currency
      ? Math.max(0, Math.round((displayedTotal.amount - cheapest.amount) * 100) / 100)
      : undefined;

  // Show a compact list, cheapest first (already sorted by the backend).
  const offers = group.offers.slice(0, 5);

  return (
    <div className="pp-root">
      <div className="pp-card">
        <Header onClose={onClose} />
        <div className="pp-body">
          {savings !== undefined && savings > 0 ? (
            <div className="pp-savings">
              <span className="pp-savings-amount">Spare {formatMoney({ amount: savings, currency: cheapest.currency })}</span>
              <span className="pp-savings-label">gegenüber dem angezeigten Preis</span>
            </div>
          ) : null}

          <ul className="pp-offer-list">
            {offers.map((offer, index) => (
              <li key={offer.offerId}>
                <a
                  className={`pp-offer${index === 0 ? " pp-offer-best" : ""}`}
                  href={buildClickUrl(backendBaseUrl, offer.offerId)}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  title={`${offer.merchantName} – ${offer.inStock ? "auf Lager" : "Verfügbarkeit prüfen"}`}
                >
                  <span className="pp-offer-merchant">{offer.merchantName}</span>
                  <span className="pp-offer-price">{formatMoney(offer.totalPrice)}</span>
                </a>
              </li>
            ))}
          </ul>

          <Disclosure />
        </div>
      </div>
    </div>
  );
}

function Header({ onClose }: { onClose: () => void }): JSX.Element {
  return (
    <div className="pp-header">
      <span className="pp-brand">🧭 PricePilot</span>
      <button
        type="button"
        className="pp-close"
        onClick={onClose}
        aria-label="Preisvergleich schließen"
      >
        ✕
      </button>
    </div>
  );
}

function Disclosure(): JSX.Element {
  return (
    <p className="pp-disclosure">
      Enthält Affiliate-Links. PricePilot ist für dich kostenlos; wir erhalten ggf. eine Provision,
      wenn du über einen Link kaufst.{" "}
      <a href="https://wotamelon99.github.io/pricepilot/#datenschutz" target="_blank" rel="noopener noreferrer">
        Mehr erfahren
      </a>
    </p>
  );
}
