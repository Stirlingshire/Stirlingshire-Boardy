import { Module } from '@nestjs/common';
import { HiresService } from './hires.service';
import { HiresController } from './hires.controller';

@Module({
  controllers: [HiresController],
  providers: [HiresService],
  exports: [HiresService],
})
export class HiresModule {}
