import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { ProfileMediaService } from './profile-media.service';

@Controller('profile')
export class ProfileMediaController {
  constructor(private readonly profileMediaService: ProfileMediaService) {}

  /** Streams the current user's avatar from storage (JWT). Use when the bucket is not public. */
  @Get('avatar')
  @UseGuards(JwtAuthGuard)
  async streamAvatar(
    @Req() req: Request & { user: JwtUser },
    @Res() res: Response,
  ): Promise<void> {
    await this.profileMediaService.streamAvatarToResponse(req.user.id, res);
  }

  @Post('avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  uploadAvatar(
    @Req() req: Request & { user: JwtUser },
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    return this.profileMediaService.uploadProfileAvatar(req.user.id, file);
  }
}
