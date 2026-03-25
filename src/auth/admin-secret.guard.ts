import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';

@Injectable()
export class AdminSecretGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const gqlContext = GqlExecutionContext.create(context);
    const raw: unknown = gqlContext.getContext();
    const ctx = raw as { req: Request };
    const req = ctx.req;

    const expected = process.env.ADMIN_RESET_SECRET;
    if (!expected) {
      throw new ForbiddenException('Reset is not configured.');
    }

    const providedHeader =
      req.headers['x-admin-secret'] ?? req.headers['X-ADMIN-SECRET'];
    const provided = Array.isArray(providedHeader)
      ? providedHeader[0]
      : providedHeader;

    if (!provided || provided !== expected) {
      throw new ForbiddenException('Invalid admin secret.');
    }

    return true;
  }
}
