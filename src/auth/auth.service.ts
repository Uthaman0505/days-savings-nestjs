import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { decode, type SignOptions } from 'jsonwebtoken';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { LoginInput } from './dto/login.input';
import { RegisterInput } from './dto/register.input';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthPayloadModel } from './models/auth-payload.model';
import { UserModel } from '../user/models/user.model';
import { resolveClientAvatarUrl } from '../profile-media/client-avatar-url';

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async register(input: RegisterInput): Promise<AuthPayloadModel> {
    const passwordHash = await bcrypt.hash(input.password, 10);
    try {
      const user = await this.userService.create({
        email: input.email,
        passwordHash,
        displayName: input.displayName ?? null,
      });
      return this.issueTokens(user);
    } catch (e) {
      if (
        e instanceof QueryFailedError &&
        (e as QueryFailedError & { driverError?: { code?: string } })
          .driverError?.code === '23505'
      ) {
        throw new BadRequestException('Registration failed');
      }
      throw e;
    }
  }

  async login(input: LoginInput): Promise<AuthPayloadModel> {
    const user = await this.userService.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    const ok = await bcrypt.compare(input.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user);
  }

  async exchangeRefreshToken(refreshToken: string): Promise<AuthPayloadModel> {
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');
    let payload: { sub: string; jti: string; typ?: string };
    try {
      payload = await this.jwtService.verifyAsync<{
        sub: string;
        jti: string;
        typ?: string;
      }>(refreshToken, { secret: refreshSecret });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (payload.typ !== 'refresh' || !payload.jti) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const record = await this.refreshTokenRepo.findOne({
      where: { jti: payload.jti },
    });
    if (
      !record ||
      record.revokedAt !== null ||
      record.expiresAt.getTime() <= Date.now() ||
      record.userId !== payload.sub
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    record.revokedAt = new Date();
    await this.refreshTokenRepo.save(record);

    const user = await this.userService.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.issueTokens(user);
  }

  private async issueTokens(user: User): Promise<AuthPayloadModel> {
    const accessExpires =
      this.configService.get<string>('JWT_EXPIRES_IN') ?? '15m';
    const refreshExpires =
      this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '7d';
    const refreshSecret =
      this.configService.getOrThrow<string>('JWT_REFRESH_SECRET');

    const jti = randomUUID();

    const accessSign = { expiresIn: accessExpires } as SignOptions;
    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        typ: 'access',
        roles: user.roles?.roles ?? ['USER'],
      },
      accessSign,
    );

    const refreshSign = {
      secret: refreshSecret,
      expiresIn: refreshExpires,
    } as SignOptions;
    const refreshToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        jti,
        typ: 'refresh',
      },
      refreshSign,
    );

    const decoded = decode(refreshToken);
    if (
      !decoded ||
      typeof decoded === 'string' ||
      !('exp' in decoded) ||
      decoded.exp === undefined
    ) {
      throw new Error('Failed to encode refresh token');
    }
    const expiresAt = new Date(decoded.exp * 1000);

    await this.refreshTokenRepo.save(
      this.refreshTokenRepo.create({
        userId: user.id,
        jti,
        expiresAt,
        revokedAt: null,
      }),
    );

    return {
      accessToken,
      refreshToken,
      user: this.toGqlUser(user),
    };
  }

  private toGqlUser(user: User): UserModel {
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: resolveClientAvatarUrl(
        user,
        this.configService.get<string>('PUBLIC_APP_URL'),
      ),
      createdAt: user.createdAt,
    };
  }
}
