import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { AppResolver } from './app.resolver';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';
import { PlansModule } from './plans/plans.module';
import { UserModule } from './user/user.module';
import { WalletModule } from './wallet/wallet.module';
import { ProfileMediaModule } from './profile-media/profile-media.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      context: ({ req }: { req: unknown }) => ({ req }),
      playground: process.env.NODE_ENV === 'production' ? true : true,
    }),
    AuthModule,
    PlansModule,
    WalletModule,
    UserModule,
    ProfileMediaModule,
  ],
  providers: [AppService, AppResolver],
})
export class AppModule {}
