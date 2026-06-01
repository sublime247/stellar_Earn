import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuotaConfig } from './entities/quota-config.entity';
import { QuotaUsage, QuotaResourceType } from './entities/quota-usage.entity';

@Injectable()
export class QuotaService {
  private readonly logger = new Logger(QuotaService.name);

  constructor(
    @InjectRepository(QuotaConfig)
    private readonly configRepo: Repository<QuotaConfig>,
    @InjectRepository(QuotaUsage)
    private readonly usageRepo: Repository<QuotaUsage>,
  ) {}

  /** Returns the quota config for a tenant, or null if none configured. */
  async getConfig(tenantId: string): Promise<QuotaConfig | null> {
    return this.configRepo.findOne({ where: { tenantId } });
  }

  /** Upserts a quota config for a tenant. */
  async setConfig(
    tenantId: string,
    config: Partial<Omit<QuotaConfig, 'id' | 'tenantId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<QuotaConfig> {
    const existing = await this.configRepo.findOne({ where: { tenantId } });
    if (existing) {
      Object.assign(existing, config);
      return this.configRepo.save(existing);
    }
    return this.configRepo.save(this.configRepo.create({ tenantId, ...config }));
  }

  /** Computes the start of the current quota period for a given config. */
  getPeriodStart(config: QuotaConfig, now = new Date()): Date {
    const periodMs = config.periodSeconds * 1000;
    const periodStart = new Date(Math.floor(now.getTime() / periodMs) * periodMs);
    return periodStart;
  }

  /** Gets or creates the usage record for the current period. */
  private async getOrCreateUsage(
    tenantId: string,
    resourceType: QuotaResourceType,
    periodStart: Date,
  ): Promise<QuotaUsage> {
    const existing = await this.usageRepo.findOne({
      where: { tenantId, resourceType, periodStart },
    });
    if (existing) return existing;

    return this.usageRepo.save(
      this.usageRepo.create({ tenantId, resourceType, periodStart }),
    );
  }

  /**
   * Checks and increments the quest creation quota for a tenant.
   * Throws ForbiddenException if the limit is exceeded.
   */
  async enforceQuestCreationQuota(tenantId: string): Promise<void> {
    const config = await this.getConfig(tenantId);
    if (!config || config.maxQuestsPerPeriod === null) return;

    const periodStart = this.getPeriodStart(config);
    const usage = await this.getOrCreateUsage(
      tenantId,
      QuotaResourceType.QUEST,
      periodStart,
    );

    if (usage.questCount >= config.maxQuestsPerPeriod) {
      this.logger.warn(
        `Tenant ${tenantId} exceeded quest quota: ${usage.questCount}/${config.maxQuestsPerPeriod}`,
      );
      throw new ForbiddenException(
        `Quest creation quota exceeded (${config.maxQuestsPerPeriod} per period)`,
      );
    }

    await this.usageRepo.increment(
      { id: usage.id },
      'questCount',
      1,
    );
  }

  /**
   * Checks and increments the payout quota for a tenant.
   * Throws ForbiddenException if any limit is exceeded.
   */
  async enforcePayoutQuota(tenantId: string, amount: number): Promise<void> {
    const config = await this.getConfig(tenantId);
    if (!config) return;

    if (
      config.maxSinglePayoutAmount !== null &&
      amount > config.maxSinglePayoutAmount
    ) {
      throw new ForbiddenException(
        `Payout amount ${amount} exceeds single payout limit of ${config.maxSinglePayoutAmount}`,
      );
    }

    if (config.maxPayoutAmountPerPeriod === null) return;

    const periodStart = this.getPeriodStart(config);
    const usage = await this.getOrCreateUsage(
      tenantId,
      QuotaResourceType.PAYOUT,
      periodStart,
    );

    const currentTotal = Number(usage.payoutAmount);
    if (currentTotal + amount > config.maxPayoutAmountPerPeriod) {
      this.logger.warn(
        `Tenant ${tenantId} exceeded payout quota: ${currentTotal + amount}/${config.maxPayoutAmountPerPeriod}`,
      );
      throw new ForbiddenException(
        `Payout quota exceeded (period limit: ${config.maxPayoutAmountPerPeriod})`,
      );
    }

    await this.usageRepo
      .createQueryBuilder()
      .update(QuotaUsage)
      .set({ payoutAmount: () => `"payoutAmount" + ${amount}` })
      .where('id = :id', { id: usage.id })
      .execute();
  }
}
