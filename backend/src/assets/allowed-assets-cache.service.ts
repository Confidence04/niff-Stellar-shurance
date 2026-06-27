import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../cache/redis.service';
import { MetricsService } from '../metrics/metrics.service';
import type { AllowedAsset } from '@prisma/client';

const DEFAULT_TTL_SECONDS = 300; // 5 minutes
const KEY_PREFIX = 'assets:allowed';

@Injectable()
export class AllowedAssetsCacheService {
  private readonly logger = new Logger(AllowedAssetsCacheService.name);
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
    @Optional() private readonly metrics?: MetricsService,
  ) {
    this.ttlSeconds = this.config.get<number>(
      'ALLOWED_ASSETS_CACHE_TTL_SECONDS',
      DEFAULT_TTL_SECONDS,
    );
  }

  private getCacheKey(): string {
    return `${KEY_PREFIX}:list`;
  }

  async getOrCompute(compute: () => Promise<AllowedAsset[]>): Promise<AllowedAsset[]> {
    const key = this.getCacheKey();
    const cached = await this.redis.get<AllowedAsset[]>(key);
    if (cached) {
      this.metrics?.recordCache('allowed_assets', 'hit');
      return cached;
    }

    this.metrics?.recordCache('allowed_assets', 'miss');
    const result = await compute();
    await this.redis.set(key, result, this.ttlSeconds);
    return result;
  }

  async invalidateAll(): Promise<void> {
    await this.redis.del(this.getCacheKey());
    this.logger.debug('Allowed assets cache invalidated');
  }
}
