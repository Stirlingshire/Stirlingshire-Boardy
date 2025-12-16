import { Module } from '@nestjs/common';
import { IntroductionsService } from './introductions.service';
import { IntroductionsController } from './introductions.controller';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
  imports: [CalendarModule],
  controllers: [IntroductionsController],
  providers: [IntroductionsService],
  exports: [IntroductionsService],
})
export class IntroductionsModule {}
