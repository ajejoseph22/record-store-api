import { Test } from '@nestjs/testing';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Logger } from '@nestjs/common';
import { CacheHelper } from './cache.helper';

describe('CacheHelper', () => {
  let helper: CacheHelper;
  let mockCache: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [CacheHelper, { provide: CACHE_MANAGER, useValue: mockCache }],
    }).compile();

    helper = module.get(CacheHelper);

    // Silence logger output during tests
    jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --- get / set / del ---

  describe('get', () => {
    it('should delegate to cache.get and return the result', async () => {
      mockCache.get.mockResolvedValue('cached-value');

      const result = await helper.get('my-key');

      expect(mockCache.get).toHaveBeenCalledWith('my-key');
      expect(result).toBe('cached-value');
    });

    it('should return undefined and log warning when cache.get throws', async () => {
      mockCache.get.mockRejectedValue(new Error('redis down'));

      const result = await helper.get('my-key');

      expect(result).toBeUndefined();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should delegate to cache.set', async () => {
      await helper.set('key', 'value', 1000);

      expect(mockCache.set).toHaveBeenCalledWith('key', 'value', 1000);
    });

    it('should not throw when cache.set fails', async () => {
      mockCache.set.mockRejectedValue(new Error('redis down'));

      await expect(helper.set('key', 'value')).resolves.toBeUndefined();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  describe('del', () => {
    it('should delegate to cache.del', async () => {
      await helper.del('key');

      expect(mockCache.del).toHaveBeenCalledWith('key');
    });

    it('should not throw when cache.del fails', async () => {
      mockCache.del.mockRejectedValue(new Error('redis down'));

      await expect(helper.del('key')).resolves.toBeUndefined();
      expect(Logger.prototype.warn).toHaveBeenCalled();
    });
  });

  // --- bumpVersion ---

  describe('bumpVersion', () => {
    it('should increment version from 0 to 1', async () => {
      const version = await helper.bumpVersion('records');

      expect(version).toBe(1);
      expect(mockCache.set).toHaveBeenCalledWith(
        'records:version',
        1,
        86_400_000,
      );
    });

    it('should increment sequentially: 1 -> 2 -> 3', async () => {
      expect(await helper.bumpVersion('records')).toBe(1);
      expect(await helper.bumpVersion('records')).toBe(2);
      expect(await helper.bumpVersion('records')).toBe(3);
    });

    it('should persist version to cache with 24h TTL', async () => {
      await helper.bumpVersion('ns');

      expect(mockCache.set).toHaveBeenCalledWith('ns:version', 1, 86_400_000);
    });
  });

  // --- getVersion ---

  describe('getVersion', () => {
    it('should return in-memory version if previously bumped', async () => {
      await helper.bumpVersion('records');

      const version = await helper.getVersion('records');

      expect(version).toBe(1);
      // Should not need to read from cache
      expect(mockCache.get).not.toHaveBeenCalled();
    });

    it('should fall back to cached version on cold start', async () => {
      mockCache.get.mockResolvedValue(5);

      const version = await helper.getVersion('records');

      expect(version).toBe(5);
      expect(mockCache.get).toHaveBeenCalledWith('records:version');
    });

    it('should return 0 when neither in-memory nor cached version exists', async () => {
      mockCache.get.mockResolvedValue(undefined);

      const version = await helper.getVersion('records');

      expect(version).toBe(0);
    });
  });
});
