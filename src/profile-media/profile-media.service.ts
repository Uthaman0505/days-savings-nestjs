import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { UserService } from '../user/user.service';
import {
  extensionFromMime,
  validateAvatarMime,
} from '../storage/file-content-type';
import { ObjectStorageService } from '../storage/object-storage.service';
import { MAX_AVATAR_BYTES } from '../storage/upload-limits';
import { resolveClientAvatarUrl } from './client-avatar-url';

type UploadAvatarFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class ProfileMediaService {
  private readonly logger = new Logger(ProfileMediaService.name);
  private readonly publicAppUrl: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly storage: ObjectStorageService,
  ) {
    this.publicAppUrl = this.configService
      .get<string>('PUBLIC_APP_URL')
      ?.trim();
  }

  async uploadProfileAvatar(
    userId: string,
    file: UploadAvatarFile,
  ): Promise<{
    id: string;
    email: string;
    displayName: string | null;
    avatarUrl: string | null;
    createdAt: Date;
  }> {
    if (!file || !file.buffer || file.size <= 0) {
      throw new BadRequestException('Image file is required.');
    }
    validateAvatarMime(file.mimetype);
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Image too large. Max size is 10MB.');
    }

    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const ext = extensionFromMime(file.mimetype);
    const key = `profiles/${userId}/${Date.now()}-${randomUUID()}.${ext}`;

    try {
      await this.storage.putObject({
        key,
        body: file.buffer,
        contentType: file.mimetype,
      });
    } catch (err) {
      if (err instanceof InternalServerErrorException) {
        throw new InternalServerErrorException(
          process.env.NODE_ENV === 'development'
            ? err.message.replace(
                'Failed to upload file.',
                'Failed to upload avatar image.',
              )
            : 'Failed to upload avatar image.',
        );
      }
      throw new InternalServerErrorException('Failed to upload avatar image.');
    }

    const directObjectUrl = `${this.storage.publicBaseUrl}/${key}`;
    const previousKey = user.avatarKey;
    const updated = await this.userService.updateAvatar(userId, {
      avatarUrl: directObjectUrl,
      avatarKey: key,
    });
    if (!updated) {
      await this.storage.deleteObject(key);
      throw new NotFoundException('User not found.');
    }

    if (previousKey && previousKey !== key) {
      await this.storage.deleteObject(previousKey);
    }

    const avatarUrl = resolveClientAvatarUrl(updated, this.publicAppUrl);

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl,
      createdAt: updated.createdAt,
    };
  }

  /**
   * Stream the authenticated user's avatar from object storage (for private buckets).
   */
  async streamAvatarToResponse(userId: string, res: Response): Promise<void> {
    const user = await this.userService.findById(userId);
    if (!user?.avatarKey) {
      res.status(404).send('No avatar');
      return;
    }

    const ok = await this.storage.streamObjectToResponse(user.avatarKey, res);
    if (!ok && !res.headersSent) {
      res.status(404).send('Avatar not found');
    }
  }
}
