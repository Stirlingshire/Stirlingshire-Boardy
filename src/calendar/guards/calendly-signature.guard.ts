import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';

@Injectable()
export class CalendlySignatureGuard implements CanActivate {
  private readonly logger = new Logger(CalendlySignatureGuard.name);
  private readonly signingKey: string | undefined;

  constructor(private readonly configService: ConfigService) {
    this.signingKey = this.configService.get<string>(
      'CALENDLY_WEBHOOK_SIGNING_KEY',
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Get the signature from Calendly header
    const signature = request.headers['calendly-webhook-signature'];

    // In development without signing key, allow requests but log warning
    if (!this.signingKey) {
      this.logger.warn(
        'CALENDLY_WEBHOOK_SIGNING_KEY not configured - skipping signature verification',
      );
      return true;
    }

    if (!signature) {
      this.logger.warn('Missing Calendly webhook signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    // Get raw body for signature verification
    const rawBody = request.rawBody;
    if (!rawBody) {
      this.logger.error('Raw body not available for signature verification');
      throw new UnauthorizedException('Cannot verify webhook signature');
    }

    // Parse the signature header (format: t=timestamp,v1=signature)
    const signatureParts = this.parseSignatureHeader(signature);
    if (!signatureParts) {
      this.logger.warn('Invalid signature header format');
      throw new UnauthorizedException('Invalid webhook signature format');
    }

    const { timestamp, v1Signature } = signatureParts;

    // Verify timestamp is within 5 minutes to prevent replay attacks
    const currentTime = Math.floor(Date.now() / 1000);
    const signatureTime = parseInt(timestamp, 10);
    if (Math.abs(currentTime - signatureTime) > 300) {
      this.logger.warn('Webhook signature timestamp too old or in future');
      throw new UnauthorizedException('Webhook signature expired');
    }

    // Compute expected signature
    const payload = `${timestamp}.${rawBody.toString('utf8')}`;
    const expectedSignature = createHmac('sha256', this.signingKey)
      .update(payload)
      .digest('hex');

    // Compare signatures using timing-safe comparison
    if (!this.timingSafeEqual(v1Signature, expectedSignature)) {
      this.logger.warn('Webhook signature verification failed');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.debug('Calendly webhook signature verified successfully');
    return true;
  }

  private parseSignatureHeader(
    header: string,
  ): { timestamp: string; v1Signature: string } | null {
    const parts: Record<string, string> = {};

    for (const part of header.split(',')) {
      const [key, value] = part.split('=');
      if (key && value) {
        parts[key] = value;
      }
    }

    if (!parts['t'] || !parts['v1']) {
      return null;
    }

    return {
      timestamp: parts['t'],
      v1Signature: parts['v1'],
    };
  }

  private timingSafeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }
}
