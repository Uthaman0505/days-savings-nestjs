import { Module } from '@nestjs/common';
import { UserModule } from '../user/user.module';
import { ProfileMediaController } from './profile-media.controller';
import { ProfileMediaService } from './profile-media.service';

@Module({
  imports: [UserModule],
  controllers: [ProfileMediaController],
  providers: [ProfileMediaService],
})
export class ProfileMediaModule {}
