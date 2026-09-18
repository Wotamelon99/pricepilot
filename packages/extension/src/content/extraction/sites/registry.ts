import { amazonExtractor } from "./amazon.js";
import { ottoExtractor } from "./otto.js";
import { mediaMarktExtractor } from "./mediamarkt.js";
import { saturnExtractor } from "./saturn.js";
import type { SiteExtractor } from "./types.js";

const EXTRACTORS: readonly SiteExtractor[] = [
  amazonExtractor,
  ottoExtractor,
  mediaMarktExtractor,
  saturnExtractor,
];

/** Finds the extractor registered for the given hostname, if any. Adding a new merchant means adding it here AND to manifest.config.ts's host permissions / content_scripts matches. */
export function getSiteExtractor(hostname: string): SiteExtractor | undefined {
  return EXTRACTORS.find((extractor) => extractor.hostnames.includes(hostname));
}
