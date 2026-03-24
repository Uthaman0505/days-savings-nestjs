import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

const hasDb = !!(process.env.DATABASE_URL || process.env.DB_DEVELOPMENT_URL);
const hasJwt = !!process.env.JWT_SECRET;
const hasRefreshJwt = !!process.env.JWT_REFRESH_SECRET;
const canRunE2e = hasDb && hasJwt && hasRefreshJwt;

(canRunE2e ? describe : describe.skip)('App (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('/graphql (POST) hello query', () => {
    return request(app.getHttpServer())
      .post('/graphql')
      .send({ query: '{ hello }' })
      .expect(200)
      .expect((res) => {
        const body = res.body as { data?: { hello?: string } };
        expect(body.data?.hello).toBe('Hello World!');
      });
  });

  it('RegisterUser mutation returns access and refresh tokens', () => {
    const email = `e2e-${Date.now()}@example.com`;
    return request(app.getHttpServer())
      .post('/graphql')
      .send({
        query: `
          mutation RegisterUser($input: RegisterInput!) {
            RegisterUser(input: $input) {
              accessToken
              refreshToken
              user { id email }
            }
          }
        `,
        variables: {
          input: {
            email,
            password: 'password12',
          },
        },
      })
      .expect(200)
      .expect((res) => {
        const body = res.body as {
          errors?: unknown;
          data?: {
            RegisterUser?: {
              accessToken?: string;
              refreshToken?: string;
              user?: { email?: string };
            };
          };
        };
        expect(body.errors).toBeUndefined();
        expect(body.data?.RegisterUser?.accessToken).toBeDefined();
        expect(body.data?.RegisterUser?.refreshToken).toBeDefined();
        expect(body.data?.RegisterUser?.user?.email).toBe(email.toLowerCase());
      });
  });
});
