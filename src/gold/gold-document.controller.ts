import {
  Controller,
  Get,
  Param,
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
import { MAX_GOLD_DOCUMENT_BYTES } from '../storage/upload-limits';
import { GoldDocumentService } from './gold-document.service';

@Controller('gold/documents')
export class GoldDocumentController {
  constructor(private readonly goldDocumentService: GoldDocumentService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_GOLD_DOCUMENT_BYTES },
    }),
  )
  uploadDocument(
    @Req() req: Request & { user: JwtUser },
    @UploadedFile()
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    return this.goldDocumentService.uploadDocument(req.user.id, file);
  }

  @Get(':id/file')
  @UseGuards(JwtAuthGuard)
  async streamDocumentFile(
    @Req() req: Request & { user: JwtUser },
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.goldDocumentService.streamDocumentFileToResponse(
      req.user.id,
      id,
      res,
    );
  }
}
