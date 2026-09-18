/**
 * User settings, persisted via chrome.storage.sync so they follow the
 * person across their signed-in Chrome installs. Never stores affiliate
 * credentials or anything backend-secret - those never leave the backend
 * (see packages/backend/src/config/env.ts).
 */

export interface PricePilotSettings {
  readonly overlayEnabled: boolean;
  readonly theme: "system" | "light" | "dark";
  readonly enabledMerchants: readonly string[];
  readonly backendBaseUrl: string;
}

export const DEFAULT_MERCHANTS = ["amazon.de", "otto.de", "mediamarkt.de", "saturn.de"] as const;

export const DEFAULT_SETTINGS: PricePilotSettings = {
  overlayEnabled: true,
  theme: "system",
  enabledMerchants: DEFAULT_MERCHANTS,
  backendBaseUrl: "https://pricepilot-r9y2.onrender.com",
};

const STORAGE_KEY = "pricepilot:settings";

export async function getSettings(): Promise<PricePilotSettings> {
  const stored = await chrome.storage.sync.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<PricePilotSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...value };
}

export async function updateSettings(
  patch: Partial<PricePilotSettings>,
): Promise<PricePilotSettings> {
  const current = await getSettings();
  const next: PricePilotSettings = { ...current, ...patch };
  await chrome.storage.sync.set({ [STORAGE_KEY]: next });
  return next;
}

export function onSettingsChanged(callback: (settings: PricePilotSettings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
    if (areaName !== "sync" || !(STORAGE_KEY in changes)) return;
    const newValue = changes[STORAGE_KEY]?.newValue as Partial<PricePilotSettings> | undefined;
    callback({ ...DEFAULT_SETTINGS, ...newValue });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
