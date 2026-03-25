import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UserService } from '../user/user.service';

export type JwtUser = {
  id: string;
  email: string;
  displayName: string | null;
  roles: string[];
  createdAt: Date;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  async validate(payload: {
    sub: string;
    typ?: string;
  }): Promise<JwtUser | null> {
    // Reject refresh tokens if they are ever sent as Bearer access tokens
    if (payload.typ === 'refresh') {
      return null;
    }
    // Accept typ === 'access' or legacy tokens without typ (before refresh-token work)
    if (payload.typ !== undefined && payload.typ !== 'access') {
      return null;
    }
    const user = await this.userService.findById(payload.sub);
    if (!user) {
      return null;
    }
    const roles = user.roles?.roles ?? ['USER'];
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles,
      createdAt: user.createdAt,
    };
  }
}
