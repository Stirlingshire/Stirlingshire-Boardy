import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { VendorsModule } from './vendors/vendors.module';
import { IntroductionsModule } from './introductions/introductions.module';
import { HiresModule } from './hires/hires.module';
import { PlacementsModule } from './placements/placements.module';
import { AuditModule } from './audit/audit.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ZoomModule } from './zoom/zoom.module';
import { CalendarModule } from './calendar/calendar.module';
import { BrokerCheckModule } from './brokercheck/brokercheck.module';
import { ApiKeyGuard } from './common/guards/api-key.guard';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    VendorsModule,
    IntroductionsModule,
    HiresModule,
    PlacementsModule,
    AuditModule,
    NotificationsModule,
    ZoomModule,
    CalendarModule,
    BrokerCheckModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ApiKeyGuard,
    },
  ],
})
export class AppModule {}
