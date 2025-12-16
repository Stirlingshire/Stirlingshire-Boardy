import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { SlackService } from './slack.service';

@Global()
@Module({
  providers: [NotificationsService, SlackService],
  exports: [NotificationsService, SlackService],
})
export class NotificationsModule {}
