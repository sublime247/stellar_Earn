import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotaService } from './quota.service';
import { QuotaConfig } from './entities/quota-config.entity';
import { QuotaUsage } from './entities/quota-usage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([QuotaConfig, QuotaUsage])],
  providers: [QuotaService],
  exports: [QuotaService],
})
export class QuotaModule {}
