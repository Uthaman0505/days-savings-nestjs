import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import { Reflector } from '@nestjs/core';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles =
      this.reflector.getAllAndOverride<string[]>('roles', [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    // If no roles metadata is set, allow.
    if (requiredRoles.length === 0) return true;

    const gqlContext = GqlExecutionContext.create(context);
    const raw: unknown = gqlContext.getContext();
    const user = (raw as { req?: { user?: { roles?: string[] } } })?.req?.user;
    const userRoles = user?.roles ?? [];

    const allowed = requiredRoles.some((r) => userRoles.includes(r));
    if (!allowed) {
      throw new ForbiddenException('Insufficient role');
    }

    return true;
  }
}
