import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Vendor } from '@prisma/client';

export const CurrentVendor = createParamDecorator(
  (data: keyof Vendor | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const vendor = request.vendor as Vendor;

    return data ? vendor?.[data] : vendor;
  },
);
