import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { HorizonService } from './horizon.service';
import { RedisService } from '../cache/redis.service';
import { PrismaService } from '../prisma/prisma.service';

jest.mock('../config/network.config', () => ({
  getNetworkConfig: () => ({
    horizonUrl: 'https://horizon-testnet.stellar.org',
    horizonFallbackUrl: 'https://horizon-fallback-testnet.stellar.org',
  }),
}));

const VALID_ACCOUNT = 'GDZST3XVCDTUJ76ZAV2HA72KYEELTJE322P3HYHBNHY56PSFPSQYOPA';

describe('HorizonService - Account and Ledger Caching', () => {
  let service: HorizonService;
  let redisService: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HorizonService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: unknown) => {
              if (key === 'HORIZON_RATE_LIMIT_MAX') return 30;
              if (key === 'HORIZON_RATE_LIMIT_WINDOW_MS') return 60000;
              if (key === 'HORIZON_CIRCUIT_BREAKER_THRESHOLD') return 5;
              if (key === 'HORIZON_CIRCUIT_BREAKER_RESET_MS') return 60000;
              if (key === 'HORIZON_API_KEY') return undefined;
              return defaultValue;
            }),
          },
        },
        {
          provide: RedisService,
          useValue: {
            get: jest.fn(),
            set: jest.fn(),
            getClient: jest.fn(),
          },
        },
        {
          provide: PrismaService,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<HorizonService>(HorizonService);
    redisService = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
  });

  describe('getAccount', () => {
    it('should return cached account data on cache hit', async () => {
      const cachedData = { id: VALID_ACCOUNT, balances: [] };
      jest.spyOn(redisService, 'get').mockResolvedValue(cachedData);

      const result = await service.getAccount(VALID_ACCOUNT);

      expect(result).toEqual(cachedData);
      expect(redisService.get).toHaveBeenCalledWith(`horizon:account:${VALID_ACCOUNT}`);
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('should fetch from Horizon and cache on cache miss', async () => {
      const horizonData = { id: VALID_ACCOUNT, sequence: '123' };
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue('OK');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(horizonData),
      });

      const result = await service.getAccount(VALID_ACCOUNT);

      expect(result).toEqual(horizonData);
      expect(redisService.set).toHaveBeenCalledWith(
        `horizon:account:${VALID_ACCOUNT}`,
        horizonData,
        15,
      );
    });

    it('should reject invalid account address', async () => {
      await expect(service.getAccount('invalid-address')).rejects.toThrow(
        BadRequestException,
      );
      expect(redisService.get).not.toHaveBeenCalled();
    });
  });

  describe('getLedger', () => {
    it('should return cached ledger data on cache hit', async () => {
      const cachedData = { sequence: 100, closed_at: '2024-01-01T00:00:00Z' };
      jest.spyOn(redisService, 'get').mockResolvedValue(cachedData);

      const result = await service.getLedger(100);

      expect(result).toEqual(cachedData);
      expect(redisService.get).toHaveBeenCalledWith('horizon:ledger:100');
      expect(redisService.set).not.toHaveBeenCalled();
    });

    it('should fetch from Horizon and cache on cache miss', async () => {
      const horizonData = { sequence: 100, closed_at: '2024-01-01T00:00:00Z' };
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue('OK');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: jest.fn().mockResolvedValue(horizonData),
      });

      const result = await service.getLedger(100);

      expect(result).toEqual(horizonData);
      expect(redisService.set).toHaveBeenCalledWith(
        'horizon:ledger:100',
        horizonData,
        15,
      );
    });

    it('should reject negative ledger sequence', async () => {
      await expect(service.getLedger(-1)).rejects.toThrow(BadRequestException);
      expect(redisService.get).not.toHaveBeenCalled();
    });

    it('should reject non-integer ledger sequence', async () => {
      await expect(service.getLedger(10.5)).rejects.toThrow(BadRequestException);
      expect(redisService.get).not.toHaveBeenCalled();
    });
  });

  describe('cache key scoping', () => {
    it('should use distinct cache keys for different accounts', async () => {
      const cachedData1 = { id: 'account1' };
      const cachedData2 = { id: 'account2' };
      jest
        .spyOn(redisService, 'get')
        .mockResolvedValueOnce(cachedData1)
        .mockResolvedValueOnce(cachedData2);

      const account1 = 'GDZST3XVCDTUJ76ZAV2HA72KYEELTJE322P3HYHBNHY56PSFPSQYOPA';
      const account2 = 'GB2Y3XCSTIYQZ4K2F7I3XLF6EV7DZHTG3XCJVTJ76BKTVJSUCORBZAQ';

      const result1 = await service.getAccount(account1);
      const result2 = await service.getAccount(account2);

      expect(result1).toEqual(cachedData1);
      expect(result2).toEqual(cachedData2);
      expect(redisService.get).toHaveBeenNthCalledWith(1, `horizon:account:${account1}`);
      expect(redisService.get).toHaveBeenNthCalledWith(2, `horizon:account:${account2}`);
    });

    it('should use distinct cache keys for different ledgers', async () => {
      const cachedData1 = { sequence: 100 };
      const cachedData2 = { sequence: 101 };
      jest
        .spyOn(redisService, 'get')
        .mockResolvedValueOnce(cachedData1)
        .mockResolvedValueOnce(cachedData2);

      const result1 = await service.getLedger(100);
      const result2 = await service.getLedger(101);

      expect(result1).toEqual(cachedData1);
      expect(result2).toEqual(cachedData2);
      expect(redisService.get).toHaveBeenNthCalledWith(1, 'horizon:ledger:100');
      expect(redisService.get).toHaveBeenNthCalledWith(2, 'horizon:ledger:101');
    });
  });

  describe('fallback endpoint', () => {
    it('should fall back to secondary endpoint on primary failure', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue('OK');

      const fallbackData = { sequence: 100 };
      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Primary endpoint unreachable'))
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(fallbackData),
        });

      const result = await service.getLedger(100);

      expect(result).toEqual(fallbackData);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use primary endpoint when it succeeds', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);
      jest.spyOn(redisService, 'set').mockResolvedValue('OK');

      const primaryData = { sequence: 100 };
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: jest.fn().mockResolvedValue(primaryData),
      });

      const result = await service.getLedger(100);

      expect(result).toEqual(primaryData);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should fail when both endpoints are unavailable', async () => {
      jest.spyOn(redisService, 'get').mockResolvedValue(null);

      global.fetch = jest
        .fn()
        .mockRejectedValueOnce(new Error('Primary down'))
        .mockRejectedValueOnce(new Error('Fallback down'));

      await expect(service.getLedger(100)).rejects.toThrow();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
