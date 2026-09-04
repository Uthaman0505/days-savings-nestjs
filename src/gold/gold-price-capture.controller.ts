import {
  BadRequestException,
  Controller,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtUser } from '../auth/jwt.strategy';
import { MAX_GOLD_DOCUMENT_BYTES } from '../storage/upload-limits';
import { GoldPriceCaptureService } from './gold-price-capture.service';
import type { GoldPriceScreenshotSide } from './gold-price-screenshot.entity';

@Controller('gold/price-captures')
export class GoldPriceCaptureController {
  constructor(
    private readonly goldPriceCaptureService: GoldPriceCaptureService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  createCapture(@Req() req: Request & { user: JwtUser }) {
    return this.goldPriceCaptureService.createCapture(req.user.id);
  }

  @Post(':captureId/screenshots')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_GOLD_DOCUMENT_BYTES },
    }),
  )
  uploadScreenshot(
    @Req() req: Request & { user: JwtUser },
    @Param('captureId') captureId: string,
    @Query('side') side: string,
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    const normalizedSide = (side ?? '').trim().toUpperCase();
    if (normalizedSide !== 'BUY' && normalizedSide !== 'SELL') {
      throw new BadRequestException('side must be BUY or SELL.');
    }
    return this.goldPriceCaptureService.uploadScreenshot(
      req.user.id,
      captureId,
      normalizedSide as GoldPriceScreenshotSide,
      file,
    );
  }
}
