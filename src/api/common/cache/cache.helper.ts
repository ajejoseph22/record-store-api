import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

@Injectable()
export class CacheHelper {
  // Authoritative version counters — kept in-process to avoid the
  // async read-modify-write race that exists when versions live only
  // in cache-manager.  The cache is still written so that getVersion
  // can hydrate on cold start, but bumpVersion is synchronous w.r.t.
  // the counter itself (safe on a single Node.js event loop).
  // For multi-process / distributed deployments, replace with an
  // atomic increment (e.g. Redis INCR).
  private readonly versions = new Map<string, number>();

  constructor(
    @InjectPinoLogger(CacheHelper.name)
    private readonly logger: PinoLogger,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      return await this.cache.get<T>(key);
    } catch (err) {
      this.logger.warn(`Cache get failed: ${key}`, err);
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttl);
    } catch (err) {
      this.logger.warn(`Cache set failed: ${key}`, err);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.cache.del(key);
    } catch (err) {
      this.logger.warn(`Cache del failed: ${key}`, err);
    }
  }

  /** Bump a namespace version counter. Returns new version. */
  async bumpVersion(namespace: string): Promise<number> {
    const current = this.versions.get(namespace) ?? 0;
    const next = current + 1;
    this.versions.set(namespace, next);
    // Long TTL for version keys — should outlive data keys
    await this.set(`${namespace}:version`, next, 86_400_000);
    return next;
  }

  async getVersion(namespace: string): Promise<number> {
    const local = this.versions.get(namespace);
    if (local !== undefined) return local;
    const cached = await this.get<number>(`${namespace}:version`);
    if (cached !== undefined) {
      this.versions.set(namespace, cached);
      return cached;
    }
    return 0;
  }
}
