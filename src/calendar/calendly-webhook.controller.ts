import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { CalendlySignatureGuard } from './guards/calendly-signature.guard';
import { CalendlyWebhookService } from './calendly-webhook.service';
import { CalendlyWebhookPayloadDto } from './dto/calendly-webhook.dto';

@ApiTags('webhooks')
@Controller('api/webhooks')
export class CalendlyWebhookController {
  private readonly logger = new Logger(CalendlyWebhookController.name);

  constructor(private readonly webhookService: CalendlyWebhookService) {}

  @Post('calendly')
  @Public()
  @UseGuards(CalendlySignatureGuard)
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // Don't show in Swagger as it's for Calendly only
  @ApiOperation({ summary: 'Handle Calendly webhook events' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid webhook payload' })
  async handleCalendlyWebhook(
    @Body() payload: CalendlyWebhookPayloadDto,
  ): Promise<{ received: boolean; message?: string }> {
    this.logger.log(`Received Calendly webhook: ${payload.event}`);

    try {
      switch (payload.event) {
        case 'invitee.created':
          const createdResult =
            await this.webhookService.handleInviteeCreated(payload);
          return {
            received: true,
            message: createdResult.message,
          };

        case 'invitee.canceled':
          const canceledResult =
            await this.webhookService.handleInviteeCanceled(payload);
          return {
            received: true,
            message: canceledResult.message,
          };

        default:
          this.logger.warn(`Unhandled Calendly event type: ${payload.event}`);
          return {
            received: true,
            message: `Event type ${payload.event} not handled`,
          };
      }
    } catch (error) {
      this.logger.error(
        `Error processing Calendly webhook: ${error.message}`,
        error.stack,
      );
      // Return 200 to prevent Calendly from retrying
      // We log the error for debugging
      return {
        received: true,
        message: 'Webhook received but processing encountered an error',
      };
    }
  }
}
