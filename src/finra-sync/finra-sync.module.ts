import { Module } from '@nestjs/common';
import { FinraSyncService } from './finra-sync.service';
import { FinraSyncController } from './finra-sync.controller';
import { HiresModule } from '../hires/hires.module';
import { PlacementsModule } from '../placements/placements.module';

@Module({
  imports: [HiresModule, PlacementsModule],
  controllers: [FinraSyncController],
  providers: [FinraSyncService],
  exports: [FinraSyncService],
})
export class FinraSyncModule {}
