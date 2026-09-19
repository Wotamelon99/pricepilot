import { useEffect, useState } from "react";
import type { DetectedProduct, Money, SearchResponse } from "../shared/types.js";
import { searchProduct, buildClickUrl, BackendRequestError } from "../api/backend-client.js";
import {
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  type PricePilotSettings,
} from "../storage/settings.js";
import { getPriceHistory, productHistoryKey, type PriceHistoryPoint } from "../storage/price-history.js";
import { excludeCurrentSiteOffers } from "../shared/current-site-offer.js";
import { LOGO_URL } from "../shared/logo.js";

type Phase =
  | { status: "loading" }
  | { status: "unsupported-page" }
  | { status: "searching"; product: DetectedProduct }
  | { status: "error"; message: string }
  | { status: "ready"; product: DetectedProduct; data: SearchResponse; history: PriceHistoryPoint[] };

function formatMoney(money: Money): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: money.currency }).format(
    money.amount,
  );
}

async function getActiveTabProduct(): Promise<DetectedProduct | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return undefined;

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(
      tab.id as number,
      { type: "pricepilot:get-current-product" },
      (response: { product?: DetectedProduct } | undefined) => {
        // chrome.runtime.lastError fires when no content script is
        // listening on this tab (e.g. a non-merchant page, or a chrome://
        // page) - that's an expected "nothing detected" case, not a bug.
        void chrome.runtime.lastError;
        resolve(response?.product);
      },
    );
  });
}

export function Popup(): JSX.Element {
  const [phase, setPhase] = useState<Phase>({ status: "loading" });
  const [settings, setSettings] = useState<PricePilotSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    void (async () => {
      const currentSettings = await getSettings();
      setSettings(currentSettings);

      const product = await getActiveTabProduct();
      if (!product) {
        setPhase({ status: "unsupported-page" });
        return;
      }

      setPhase({ status: "searching", product });

      try {
        const rawData = await searchProduct(currentSettings.backendBaseUrl, product);
        // Drop offers from the very site the user is already on - see
        // shared/current-site-offer.ts.
        const results = excludeCurrentSiteOffers(rawData.results, product.pageUrl);
        const data: SearchResponse = { ...rawData, results, resultCount: results.length };
        const history = await getPriceHistory(productHistoryKey(product.identity));
        setPhase({ status: "ready", product, data, history });
      } catch (err) {
        setPhase({
          status: "error",
          message: err instanceof BackendRequestError ? err.message : "Unbekannter Fehler",
        });
      }
    })();
  }, []);

  async function toggleOverlay(): Promise<void> {
    const next = await updateSettings({ overlayEnabled: !settings.overlayEnabled });
    setSettings(next);
  }

  async function changeTheme(theme: PricePilotSettings["theme"]): Promise<void> {
    const next = await updateSettings({ theme });
    setSettings(next);
  }

  return (
    <div className="pp-app">
      <div className="pp-topbar">
        <h1>
          <img src={LOGO_URL} alt="" width={20} height={20} className="pp-logo" /> PricePilot
        </h1>
      </div>

      <div className="pp-section">
        <h2>Dieses Produkt</h2>
        <ProductSection phase={phase} settings={settings} />
      </div>

      <div className="pp-section">
        <h2>Einstellungen</h2>
        <div className="pp-toggle-row">
          <span>Preisvergleich-Overlay anzeigen</span>
          <input
            type="checkbox"
            className="pp-switch"
            checked={settings.overlayEnabled}
            onChange={() => void toggleOverlay()}
          />
        </div>
        <div className="pp-toggle-row">
          <span>Design</span>
          <select
            className="pp-select"
            value={settings.theme}
            onChange={(e) => void changeTheme(e.target.value as PricePilotSettings["theme"])}
          >
            <option value="system">System</option>
            <option value="light">Hell</option>
            <option value="dark">Dunkel</option>
          </select>
        </div>
      </div>

      <div className="pp-footer">
        100% kostenlos · finanziert durch Affiliate-Links ·{" "}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            // The official MV3 API for this - resolves correctly regardless
            // of the exact built path of options/index.html, unlike a raw
            // relative link would.
            chrome.runtime.openOptionsPage();
          }}
        >
          Alle Einstellungen
        </a>
      </div>
    </div>
  );
}

function ProductSection({
  phase,
  settings,
}: {
  phase: Phase;
  settings: PricePilotSettings;
}): JSX.Element {
  if (phase.status === "loading" || phase.status === "searching") {
    return <p className="pp-muted">Suche läuft…</p>;
  }

  if (phase.status === "unsupported-page") {
    return (
      <p className="pp-muted">
        Kein Produkt erkannt. Öffne eine Produktseite bei Amazon.de, Otto.de, MediaMarkt.de oder
        Saturn.de.
      </p>
    );
  }

  if (phase.status === "error") {
    return <p className="pp-error">Fehler: {phase.message}</p>;
  }

  const group = phase.data.results[0];
  if (!group || phase.data.resultCount === 0) {
    return <p className="pp-muted">Für dieses Produkt wurden noch keine Angebote gefunden.</p>;
  }

  const offers = group.offers.slice(0, 5);

  return (
    <>
      <p className="pp-product-title">{group.product.title}</p>
      {offers.map((offer, index) => (
        <a
          key={offer.offerId}
          className={`pp-offer-row${index === 0 ? " best" : ""}`}
          href={buildClickUrl(settings.backendBaseUrl, offer.offerId)}
          target="_blank"
          rel="noopener noreferrer sponsored"
        >
          <span className="merchant">{offer.merchantName}</span>
          <span className="price">{formatMoney(offer.totalPrice)}</span>
        </a>
      ))}

      {phase.history.length > 0 ? (
        <>
          <h2 style={{ marginTop: 12 }}>Preisverlauf (auf diesem Gerät)</h2>
          <ul className="pp-history-list">
            {phase.history
              .slice(-5)
              .reverse()
              .map((point, i) => (
                <li key={i}>
                  {new Date(point.observedAt).toLocaleDateString("de-DE")} · {point.merchantName} ·{" "}
                  {formatMoney({ amount: point.totalAmount, currency: point.currency })}
                </li>
              ))}
          </ul>
        </>
      ) : null}
    </>
  );
}
