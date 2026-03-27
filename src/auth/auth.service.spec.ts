import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { sign } from 'jsonwebtoken';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from '../user/user.entity';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { RefreshToken } from './entities/refresh-token.entity';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: jest.Mocked<
    Pick<UserService, 'create' | 'findByEmail' | 'findById'>
  >;
  let jwtService: jest.Mocked<Pick<JwtService, 'signAsync' | 'verifyAsync'>>;
  let refreshTokenRepo: jest.Mocked<
    Pick<Repository<RefreshToken>, 'save' | 'create' | 'findOne'>
  >;
  let configService: jest.Mocked<Pick<ConfigService, 'get' | 'getOrThrow'>>;

  beforeEach(async () => {
    userService = {
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
    };
    jwtService = {
      signAsync: jest
        .fn()
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce(
          sign({ sub: 'u1', jti: 'jti-1', typ: 'refresh' }, 'refresh-secret', {
            expiresIn: '7d',
          }),
        ),
      verifyAsync: jest.fn(),
    };
    refreshTokenRepo = {
      create: jest.fn((x) => x as RefreshToken),
      save: jest.fn((x) => Promise.resolve(x as RefreshToken)),
      findOne: jest.fn(),
    };
    configService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_EXPIRES_IN') return '15m';
        if (key === 'JWT_REFRESH_EXPIRES_IN') return '7d';
        return undefined;
      }),
      getOrThrow: jest.fn((key: string) => {
        if (key === 'JWT_REFRESH_SECRET') return 'refresh-secret';
        return '';
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UserService, useValue: userService },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepo,
        },
      ],
    }).compile();

    authService = module.get(AuthService);
  });

  describe('register', () => {
    it('returns tokens and user on success', async () => {
      const user: User = {
        id: 'u1',
        email: 'a@b.com',
        passwordHash: 'hash',
        displayName: null,
        avatarUrl: null,
        avatarKey: null,
        roles: { roles: ['USER'] },
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      userService.create.mockResolvedValue(user);

      const result = await authService.register({
        email: 'a@b.com',
        password: 'password12',
      });

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('a@b.com');
      expect(jwtService.signAsync).toHaveBeenCalled();
    });

    it('maps duplicate email to BadRequestException', async () => {
      const err = Object.assign(new QueryFailedError('', [], new Error()), {
        driverError: { code: '23505' },
      });
      userService.create.mockRejectedValue(err);

      await expect(
        authService.register({ email: 'a@b.com', password: 'password12' }),
      ).rejects.toThrow('Registration failed');
    });
  });

  describe('login', () => {
    it('rejects when user missing', async () => {
      userService.findByEmail.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'a@b.com', password: 'password12' }),
      ).rejects.toThrow('Invalid credentials');
    });
  });
});
