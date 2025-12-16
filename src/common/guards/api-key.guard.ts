import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];

    if (!apiKey) {
      throw new UnauthorizedException('API key is required');
    }

    // Hash the provided API key
    const apiKeyHash = createHash('sha256').update(apiKey).digest('hex');

    // Find vendor with matching API key hash
    const vendor = await this.prisma.vendor.findFirst({
      where: {
        apiKeyHash,
        isActive: true,
      },
    });

    if (!vendor) {
      throw new UnauthorizedException('Invalid API key');
    }

    // Attach vendor to request for later use
    request.vendor = vendor;

    return true;
  }
}
