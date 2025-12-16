import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { MicrosoftGraphService } from './microsoft-graph.service';
import { CalendlyService } from './calendly.service';
import { ZoomModule } from '../zoom/zoom.module';

@Module({
  imports: [ZoomModule],
  controllers: [CalendarController],
  providers: [CalendarService, MicrosoftGraphService, CalendlyService],
  exports: [CalendarService, CalendlyService],
})
export class CalendarModule {}
