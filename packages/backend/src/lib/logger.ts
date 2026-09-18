import pino from "pino";
import { config } from "../config/env.js";

// pino's LoggerOptions types `transport?: TransportSingleOptions | ...`
// (no `undefined` in the union), so under exactOptionalPropertyTypes the
// key must be omitted entirely in production rather than set to
// `undefined`.
export const logger = pino({
  level: config.logLevel,
  ...(config.nodeEnv === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});
