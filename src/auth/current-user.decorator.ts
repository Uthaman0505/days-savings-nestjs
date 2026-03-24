import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { GqlExecutionContext } from '@nestjs/graphql';
import type { Request } from 'express';
import type { JwtUser } from './jwt.strategy';

type GqlRequest = Request & { user?: JwtUser };

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtUser | undefined => {
    const ctx = GqlExecutionContext.create(context);
    const raw: unknown = ctx.getContext();
    const gqlContext = raw as { req: GqlRequest };
    return gqlContext.req.user;
  },
);
