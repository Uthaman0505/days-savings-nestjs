import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { UserService } from '../user/user.service';

const MAX_AVATAR_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

type UploadAvatarFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class ProfileMediaService {
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
  ) {
    const endpoint = this.mustGet('STORAGE_ENDPOINT');
    const region = this.mustGet('STORAGE_REGION');
    const accessKeyId = this.mustGet('STORAGE_ACCESS_KEY');
    const secretAccessKey = this.mustGet('STORAGE_SECRET_KEY');
    this.bucket = this.mustGet('STORAGE_BUCKET');
    this.publicBaseUrl = this.mustGet('STORAGE_PUBLIC_BASE_URL').replace(
      /\/+$/,
      '',
    );
    const forcePathStyle =
      (this.configService.get<string>('STORAGE_FORCE_PATH_STYLE') ?? 'true') ===
      'true';

    this.s3 = new S3Client({
      region,
      endpoint,
      forcePathStyle,
      credentials: { accessKeyId, secretAccessKey },
    });
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
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Unsupported image type. Allowed: jpeg, png, webp.',
      );
    }
    if (file.size > MAX_AVATAR_BYTES) {
      throw new BadRequestException('Image too large. Max size is 10MB.');
    }

    const user = await this.userService.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const ext = this.extensionFromMime(file.mimetype);
    const key = `profiles/${userId}/${Date.now()}-${randomUUID()}.${ext}`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ACL: 'public-read',
        }),
      );
    } catch {
      throw new InternalServerErrorException('Failed to upload avatar image.');
    }

    const avatarUrl = `${this.publicBaseUrl}/${key}`;
    const previousKey = user.avatarKey;
    const updated = await this.userService.updateAvatar(userId, {
      avatarUrl,
      avatarKey: key,
    });
    if (!updated) {
      throw new NotFoundException('User not found.');
    }

    if (previousKey && previousKey !== key) {
      // Best effort cleanup of replaced image.
      try {
        await this.s3.send(
          new DeleteObjectCommand({
            Bucket: this.bucket,
            Key: previousKey,
          }),
        );
      } catch {
        // Ignore cleanup failure.
      }
    }

    return {
      id: updated.id,
      email: updated.email,
      displayName: updated.displayName,
      avatarUrl: updated.avatarUrl,
      createdAt: updated.createdAt,
    };
  }

  private mustGet(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new Error(`Missing required env var: ${name}`);
    }
    return value;
  }

  private extensionFromMime(mime: string): string {
    if (mime === 'image/jpeg') return 'jpg';
    if (mime === 'image/png') return 'png';
    if (mime === 'image/webp') return 'webp';
    return 'bin';
  }
}
