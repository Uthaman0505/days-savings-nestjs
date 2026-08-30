import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  type GetObjectCommandOutput,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Response } from 'express';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export type PutObjectParams = {
  key: string;
  body: Buffer;
  contentType: string;
};

@Injectable()
export class ObjectStorageService {
  private readonly logger = new Logger(ObjectStorageService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  readonly publicBaseUrl: string;

  constructor(private readonly configService: ConfigService) {
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

  get optionalPutObjectAcl(): string | undefined {
    return this.configService.get<string>('STORAGE_PUT_OBJECT_ACL')?.trim();
  }

  async putObject(params: PutObjectParams): Promise<void> {
    const acl = this.optionalPutObjectAcl;
    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: params.key,
          Body: params.body,
          ContentType: params.contentType,
          ...(acl ? { ACL: acl as 'public-read' } : {}),
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`S3 PutObject failed for key prefix: ${msg}`);
      throw new InternalServerErrorException(
        process.env.NODE_ENV === 'development'
          ? `Failed to upload object: ${msg}`
          : 'Failed to upload file.',
      );
    }
  }

  async getObject(key: string): Promise<GetObjectCommandOutput> {
    try {
      return await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`S3 GetObject failed: ${msg}`);
      throw new InternalServerErrorException(
        process.env.NODE_ENV === 'development'
          ? `Failed to read object: ${msg}`
          : 'Failed to read file.',
      );
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    const out = await this.getObject(key);
    const body = out.Body;
    if (!body) {
      throw new InternalServerErrorException('Failed to read file.');
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of body as Readable) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async deleteObject(key: string): Promise<void> {
    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`S3 DeleteObject failed: ${msg}`);
    }
  }

  async streamObjectToResponse(
    key: string,
    res: Response,
    options: {
      contentType?: string;
      contentDisposition?: string;
      cacheControl?: string;
    } = {},
  ): Promise<boolean> {
    let out: GetObjectCommandOutput;
    try {
      out = await this.s3.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
        }),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`S3 GetObject failed: ${msg}`);
      return false;
    }

    const body = out.Body;
    if (!body) {
      return false;
    }

    res.setHeader(
      'Content-Type',
      options.contentType ?? out.ContentType ?? 'application/octet-stream',
    );
    if (options.contentDisposition) {
      res.setHeader('Content-Disposition', options.contentDisposition);
    }
    res.setHeader(
      'Cache-Control',
      options.cacheControl ?? 'private, max-age=300',
    );

    const stream = body as Readable;
    try {
      await pipeline(stream, res);
      return true;
    } catch (err) {
      if (!res.headersSent) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Object stream failed: ${msg}`);
        res.status(500).end();
      }
      return false;
    }
  }

  private mustGet(name: string): string {
    const value = this.configService.get<string>(name);
    if (!value) {
      throw new Error(`Missing required env var: ${name}`);
    }
    return value;
  }
}
