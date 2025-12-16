import { Module } from '@nestjs/common';
import { BrokerCheckSyncController } from './brokercheck-sync.controller';
import { BrokerCheckSyncService } from './brokercheck-sync.service';
import { BrokerCheckApiClient } from './brokercheck-api.client';
import { HiresModule } from '../hires/hires.module';
import { PlacementsModule } from '../placements/placements.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [HiresModule, PlacementsModule, NotificationsModule],
  controllers: [BrokerCheckSyncController],
  providers: [BrokerCheckSyncService, BrokerCheckApiClient],
  exports: [BrokerCheckSyncService],
})
export class BrokerCheckModule {}
