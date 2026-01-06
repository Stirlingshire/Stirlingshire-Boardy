import { Module } from '@nestjs/common';
import { CalendarController } from './calendar.controller';
import { CalendarService } from './calendar.service';
import { MicrosoftGraphService } from './microsoft-graph.service';
import { CalendlyService } from './calendly.service';
import { CalendlyWebhookController } from './calendly-webhook.controller';
import { CalendlyWebhookService } from './calendly-webhook.service';
import { CalendlySignatureGuard } from './guards/calendly-signature.guard';
import { ZoomModule } from '../zoom/zoom.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../audit/audit.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ZoomModule, PrismaModule, AuditModule, NotificationsModule],
  controllers: [CalendarController, CalendlyWebhookController],
  providers: [
    CalendarService,
    MicrosoftGraphService,
    CalendlyService,
    CalendlyWebhookService,
    CalendlySignatureGuard,
  ],
  exports: [CalendarService, CalendlyService, CalendlyWebhookService],
})
export class CalendarModule {}
