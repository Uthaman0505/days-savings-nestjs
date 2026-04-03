import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { UserService } from '../user/user.service';
import { resolveClientAvatarUrl } from './client-avatar-url';

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
  private readonly logger = new Logger(ProfileMediaService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly publicAppUrl: string | undefined;

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
    this.publicAppUrl = this.configService.get<string>('PUBLIC_APP_URL')?.trim();
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
      // Many S3-compatible providers disable ACLs; PutObject with ACL then fails.
      // Set STORAGE_PUT_OBJECT_ACL=public-read only if your bucket supports object ACLs.
      const acl = this.configService.get<string>('STORAGE_PUT_OBJECT_ACL');
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
          ...(acl ? { ACL: acl as 'public-read' } : {}),
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`S3 PutObject failed: ${msg}`);
      throw new InternalServerErrorException(
        process.env.NODE_ENV === 'development'
          ? `Failed to upload avatar image: ${msg}`
          : 'Failed to upload avatar image.',
      );
    }

    const directObjectUrl = `${this.publicBaseUrl}/${key}`;
    const previousKey = user.avatarKey;
    const updated = await this.userService.updateAvatar(userId, {
      avatarUrl: directObjectUrl,
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

    let out;
    try {
      out = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: user.avatarKey,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`S3 GetObject failed: ${msg}`);
      res.status(404).send('Avatar not found');
      return;
    }

    const body = out.Body;
    if (!body) {
      res.status(404).send('Avatar not found');
      return;
    }

    const ct = out.ContentType ?? 'application/octet-stream';
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'private, max-age=300');

    const stream = body as Readable;
    try {
      await pipeline(stream, res);
    } catch (err) {
      if (!res.headersSent) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Avatar stream failed: ${msg}`);
        res.status(500).end();
      }
    }
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
