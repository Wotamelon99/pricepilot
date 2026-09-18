// Under `moduleResolution: NodeNext`, ioredis's default export resolves to
// a namespace/module type rather than the Redis class itself (a known
// ioredis + ESM typing quirk) - the named import is the documented fix and
// is the same class.
import { Redis } from "ioredis";
import { config } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * Thin cache-aside abstraction over Redis.
 *
 * Every provider/search result that is safe to reuse across users
 * (i.e. contains no user-identifying data) should be cached through here
 * with a bounded TTL, defaulting to CACHE_TTL_SECONDS (900s / 15 min).
 */
export class Cache {
  private readonly client: Redis;
  private connected = false;

  constructor(url: string = config.redisUrl) {
    this.client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 2,
      retryStrategy: (times: number) => Math.min(times * 200, 2000),
    });

    this.client.on("error", (err: Error) => {
      logger.warn({ err }, "redis client error");
    });
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect();
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    await this.client.quit();
    this.connected = false;
  }

  async ping(): Promise<boolean> {
    try {
      const res = await this.client.ping();
      return res === "PONG";
    } catch {
      return false;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(key);
    if (raw === null) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      logger.warn({ key }, "failed to parse cached value, ignoring");
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number = config.cacheTtlSeconds): Promise<void> {
    await this.client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  }

  /**
   * Cache-aside helper: return the cached value if present, otherwise
   * compute it via `fn`, cache the result, and return it.
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttlSeconds: number = config.cacheTtlSeconds,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) return cached;
    const fresh = await fn();
    await this.set(key, fresh, ttlSeconds);
    return fresh;
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  get raw(): Redis {
    return this.client;
  }
}

export const cache = new Cache();
