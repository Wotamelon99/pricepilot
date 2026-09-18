import { useEffect, useState } from "react";
import {
  DEFAULT_MERCHANTS,
  DEFAULT_SETTINGS,
  getSettings,
  updateSettings,
  type PricePilotSettings,
} from "../storage/settings.js";
import { clearAllPriceHistory } from "../storage/price-history.js";

const MERCHANT_LABELS: Record<(typeof DEFAULT_MERCHANTS)[number], string> = {
  "amazon.de": "Amazon.de",
  "otto.de": "Otto.de",
  "mediamarkt.de": "MediaMarkt.de",
  "saturn.de": "Saturn.de",
};

export function Options(): JSX.Element {
  const [settings, setSettings] = useState<PricePilotSettings>(DEFAULT_SETTINGS);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    void getSettings().then(setSettings);
  }, []);

  async function apply(patch: Partial<PricePilotSettings>): Promise<void> {
    const next = await updateSettings(patch);
    setSettings(next);
    setStatus("Gespeichert.");
    setTimeout(() => setStatus(""), 1500);
  }

  function toggleMerchant(merchant: string): void {
    const enabled = new Set(settings.enabledMerchants);
    if (enabled.has(merchant)) {
      enabled.delete(merchant);
    } else {
      enabled.add(merchant);
    }
    void apply({ enabledMerchants: [...enabled] });
  }

  async function handleClearHistory(): Promise<void> {
    await clearAllPriceHistory();
    setStatus("Preisverlauf (auf diesem Gerät) wurde gelöscht.");
    setTimeout(() => setStatus(""), 2000);
  }

  return (
    <div className="pp-options">
      <h1>🧭 PricePilot – Einstellungen</h1>
      <p className="pp-subtitle">
        PricePilot ist und bleibt für dich 100% kostenlos. Wir finanzieren uns ausschließlich über
        Affiliate-Provisionen der Händler, ohne dass dir dadurch Mehrkosten entstehen.
      </p>

      <section className="pp-card">
        <h2>Allgemein</h2>
        <div className="pp-row">
          <div>
            <div className="pp-row-label">Preisvergleich-Overlay anzeigen</div>
            <div className="pp-row-hint">Zeigt auf unterstützten Produktseiten automatisch günstigere Angebote an.</div>
          </div>
          <input
            type="checkbox"
            className="pp-switch"
            checked={settings.overlayEnabled}
            onChange={() => void apply({ overlayEnabled: !settings.overlayEnabled })}
          />
        </div>
        <div className="pp-row">
          <div className="pp-row-label">Design</div>
          <select
            value={settings.theme}
            onChange={(e) => void apply({ theme: e.target.value as PricePilotSettings["theme"] })}
          >
            <option value="system">System</option>
            <option value="light">Hell</option>
            <option value="dark">Dunkel</option>
          </select>
        </div>
      </section>

      <section className="pp-card">
        <h2>Aktive Händler</h2>
        <div className="pp-merchant-grid">
          {DEFAULT_MERCHANTS.map((merchant) => (
            <label key={merchant} className="pp-row">
              <span className="pp-row-label">{MERCHANT_LABELS[merchant]}</span>
              <input
                type="checkbox"
                className="pp-switch"
                checked={settings.enabledMerchants.includes(merchant)}
                onChange={() => toggleMerchant(merchant)}
              />
            </label>
          ))}
        </div>
      </section>

      <section className="pp-card">
        <h2>Entwickler / Backend</h2>
        <div className="pp-row">
          <div>
            <div className="pp-row-label">Backend-URL</div>
            <div className="pp-row-hint">Nur ändern, wenn du einen eigenen PricePilot-Backend-Server betreibst.</div>
          </div>
          <input
            type="text"
            value={settings.backendBaseUrl}
            onChange={(e) => void apply({ backendBaseUrl: e.target.value })}
          />
        </div>
      </section>

      <section className="pp-card">
        <h2>Datenschutz</h2>
        <p className="pp-row-hint">
          Preisvergleiche werden anonym durchgeführt; für die Nutzung ist kein Konto erforderlich.
          Der auf diesem Gerät gespeicherte Preisverlauf verlässt niemals dieses Gerät.
        </p>
        <button type="button" className="pp-danger" onClick={() => void handleClearHistory()}>
          Preisverlauf auf diesem Gerät löschen
        </button>
        <div className="pp-status">{status}</div>
      </section>
    </div>
  );
}
