import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ForbiddenException } from '@nestjs/common';
import { QuotaService } from './quota.service';
import { QuotaConfig } from './entities/quota-config.entity';
import { QuotaUsage, QuotaResourceType } from './entities/quota-usage.entity';

const makeConfig = (overrides: Partial<QuotaConfig> = {}): QuotaConfig =>
  ({
    id: 'cfg-1',
    tenantId: 'TENANT_A',
    maxQuestsPerPeriod: 5,
    maxPayoutAmountPerPeriod: 1000,
    maxSinglePayoutAmount: 200,
    periodSeconds: 86400,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as QuotaConfig);

const makeUsage = (overrides: Partial<QuotaUsage> = {}): QuotaUsage =>
  ({
    id: 'usage-1',
    tenantId: 'TENANT_A',
    resourceType: QuotaResourceType.QUEST,
    periodStart: new Date('2026-06-01T00:00:00.000Z'),
    questCount: 0,
    payoutAmount: 0,
    createdAt: new Date(),
    ...overrides,
  } as QuotaUsage);

const mockConfigRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
});

const mockUsageRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  increment: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('QuotaService', () => {
  let service: QuotaService;
  let configRepo: ReturnType<typeof mockConfigRepo>;
  let usageRepo: ReturnType<typeof mockUsageRepo>;

  beforeEach(async () => {
    configRepo = mockConfigRepo();
    usageRepo = mockUsageRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuotaService,
        { provide: getRepositoryToken(QuotaConfig), useValue: configRepo },
        { provide: getRepositoryToken(QuotaUsage), useValue: usageRepo },
      ],
    }).compile();

    service = module.get<QuotaService>(QuotaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── getPeriodStart ────────────────────────────────────────────────────────

  describe('getPeriodStart', () => {
    it('returns the floored period start for a daily period', () => {
      const config = makeConfig({ periodSeconds: 86400 });
      const now = new Date('2026-06-01T15:30:00.000Z');
      const result = service.getPeriodStart(config, now);
      expect(result.toISOString()).toBe('2026-06-01T00:00:00.000Z');
    });

    it('returns the floored period start for an hourly period', () => {
      const config = makeConfig({ periodSeconds: 3600 });
      const now = new Date('2026-06-01T15:45:00.000Z');
      const result = service.getPeriodStart(config, now);
      expect(result.toISOString()).toBe('2026-06-01T15:00:00.000Z');
    });
  });

  // ─── getConfig ────────────────────────────────────────────────────────────

  describe('getConfig', () => {
    it('returns config when found', async () => {
      const config = makeConfig();
      configRepo.findOne.mockResolvedValue(config);
      const result = await service.getConfig('TENANT_A');
      expect(result).toBe(config);
    });

    it('returns null when not found', async () => {
      configRepo.findOne.mockResolvedValue(null);
      const result = await service.getConfig('UNKNOWN');
      expect(result).toBeNull();
    });
  });

  // ─── setConfig ────────────────────────────────────────────────────────────

  describe('setConfig', () => {
    it('creates a new config when none exists', async () => {
      configRepo.findOne.mockResolvedValue(null);
      const newConfig = makeConfig();
      configRepo.create.mockReturnValue(newConfig);
      configRepo.save.mockResolvedValue(newConfig);

      const result = await service.setConfig('TENANT_A', { maxQuestsPerPeriod: 10 });
      expect(configRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'TENANT_A', maxQuestsPerPeriod: 10 }),
      );
      expect(result).toBe(newConfig);
    });

    it('updates existing config', async () => {
      const existing = makeConfig();
      configRepo.findOne.mockResolvedValue(existing);
      configRepo.save.mockResolvedValue({ ...existing, maxQuestsPerPeriod: 20 });

      const result = await service.setConfig('TENANT_A', { maxQuestsPerPeriod: 20 });
      expect(result.maxQuestsPerPeriod).toBe(20);
    });
  });

  // ─── enforceQuestCreationQuota ────────────────────────────────────────────

  describe('enforceQuestCreationQuota', () => {
    it('does nothing when no config exists', async () => {
      configRepo.findOne.mockResolvedValue(null);
      await expect(service.enforceQuestCreationQuota('TENANT_A')).resolves.toBeUndefined();
      expect(usageRepo.findOne).not.toHaveBeenCalled();
    });

    it('does nothing when maxQuestsPerPeriod is null (unlimited)', async () => {
      configRepo.findOne.mockResolvedValue(makeConfig({ maxQuestsPerPeriod: null }));
      await expect(service.enforceQuestCreationQuota('TENANT_A')).resolves.toBeUndefined();
    });

    it('increments quest count when under limit', async () => {
      configRepo.findOne.mockResolvedValue(makeConfig({ maxQuestsPerPeriod: 5 }));
      const usage = makeUsage({ questCount: 3 });
      usageRepo.findOne.mockResolvedValue(usage);
      usageRepo.increment.mockResolvedValue(undefined);

      await service.enforceQuestCreationQuota('TENANT_A');
      expect(usageRepo.increment).toHaveBeenCalledWith({ id: usage.id }, 'questCount', 1);
    });

    it('throws ForbiddenException when quest limit is reached', async () => {
      configRepo.findOne.mockResolvedValue(makeConfig({ maxQuestsPerPeriod: 5 }));
      usageRepo.findOne.mockResolvedValue(makeUsage({ questCount: 5 }));

      await expect(service.enforceQuestCreationQuota('TENANT_A')).rejects.toThrow(
        ForbiddenException,
      );
      expect(usageRepo.increment).not.toHaveBeenCalled();
    });

    it('creates a new usage record when none exists for the period', async () => {
      configRepo.findOne.mockResolvedValue(makeConfig({ maxQuestsPerPeriod: 5 }));
      usageRepo.findOne.mockResolvedValue(null);
      const newUsage = makeUsage({ questCount: 0 });
      usageRepo.create.mockReturnValue(newUsage);
      usageRepo.save.mockResolvedValue(newUsage);
      usageRepo.increment.mockResolvedValue(undefined);

      await service.enforceQuestCreationQuota('TENANT_A');
      expect(usageRepo.save).toHaveBeenCalled();
      expect(usageRepo.increment).toHaveBeenCalled();
    });
  });

  // ─── enforcePayoutQuota ───────────────────────────────────────────────────

  describe('enforcePayoutQuota', () => {
    it('does nothing when no config exists', async () => {
      configRepo.findOne.mockResolvedValue(null);
      await expect(service.enforcePayoutQuota('TENANT_A', 100)).resolves.toBeUndefined();
    });

    it('throws ForbiddenException when single payout exceeds limit', async () => {
      configRepo.findOne.mockResolvedValue(makeConfig({ maxSinglePayoutAmount: 200 }));

      await expect(service.enforcePayoutQuota('TENANT_A', 201)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('does nothing when maxPayoutAmountPerPeriod is null (unlimited)', async () => {
      configRepo.findOne.mockResolvedValue(
        makeConfig({ maxSinglePayoutAmount: null, maxPayoutAmountPerPeriod: null }),
      );
      await expect(service.enforcePayoutQuota('TENANT_A', 9999)).resolves.toBeUndefined();
    });

    it('increments payout amount when under period limit', async () => {
      configRepo.findOne.mockResolvedValue(
        makeConfig({ maxSinglePayoutAmount: null, maxPayoutAmountPerPeriod: 1000 }),
      );
      const usage = makeUsage({ resourceType: QuotaResourceType.PAYOUT, payoutAmount: 500 });
      usageRepo.findOne.mockResolvedValue(usage);

      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      usageRepo.createQueryBuilder.mockReturnValue(qb);

      await service.enforcePayoutQuota('TENANT_A', 300);
      expect(qb.execute).toHaveBeenCalled();
    });

    it('throws ForbiddenException when period payout limit would be exceeded', async () => {
      configRepo.findOne.mockResolvedValue(
        makeConfig({ maxSinglePayoutAmount: null, maxPayoutAmountPerPeriod: 1000 }),
      );
      usageRepo.findOne.mockResolvedValue(
        makeUsage({ resourceType: QuotaResourceType.PAYOUT, payoutAmount: 800 }),
      );

      await expect(service.enforcePayoutQuota('TENANT_A', 300)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows payout exactly at the period limit', async () => {
      configRepo.findOne.mockResolvedValue(
        makeConfig({ maxSinglePayoutAmount: null, maxPayoutAmountPerPeriod: 1000 }),
      );
      const usage = makeUsage({ resourceType: QuotaResourceType.PAYOUT, payoutAmount: 700 });
      usageRepo.findOne.mockResolvedValue(usage);

      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      usageRepo.createQueryBuilder.mockReturnValue(qb);

      await service.enforcePayoutQuota('TENANT_A', 300);
      expect(qb.execute).toHaveBeenCalled();
    });
  });
});
