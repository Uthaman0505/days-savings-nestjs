import { UseGuards } from '@nestjs/common';
import { Args, Mutation, Query, Resolver } from '@nestjs/graphql';
import type { JwtUser } from './jwt.strategy';
import { AuthService } from './auth.service';
import { LoginInput } from './dto/login.input';
import { RegisterInput } from './dto/register.input';
import { AuthPayloadModel } from './models/auth-payload.model';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';
import { UserModel } from '../user/models/user.model';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => AuthPayloadModel, { name: 'RegisterUser' })
  register(@Args('input') input: RegisterInput): Promise<AuthPayloadModel> {
    return this.authService.register(input);
  }

  @Mutation(() => AuthPayloadModel, { name: 'LoginUser' })
  login(@Args('input') input: LoginInput): Promise<AuthPayloadModel> {
    return this.authService.login(input);
  }

  @Mutation(() => AuthPayloadModel, { name: 'RefreshTokens' })
  refreshTokens(
    @Args('refreshToken') refreshToken: string,
  ): Promise<AuthPayloadModel> {
    return this.authService.exchangeRefreshToken(refreshToken);
  }

  @Query(() => UserModel)
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtUser): UserModel {
    return user;
  }
}
