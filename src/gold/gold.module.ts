import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ImageTextExtractorService } from './extraction/image-text.extractor';
import { GoldDocumentController } from './gold-document.controller';
import { GoldDocument } from './gold-document.entity';
import { GoldExtractionItem } from './gold-extraction-item.entity';
import { GoldDocumentService } from './gold-document.service';
import { GoldExtractionService } from './gold-extraction.service';
import { GoldPriceCaptureController } from './gold-price-capture.controller';
import { GoldPriceCapture } from './gold-price-capture.entity';
import { GoldPriceCaptureService } from './gold-price-capture.service';
import { GoldPriceScreenshot } from './gold-price-screenshot.entity';
import { GoldPrice } from './gold-price.entity';
import { GoldPurchase } from './gold-purchase.entity';
import { GoldResolver } from './gold.resolver';
import { GoldService } from './gold.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GoldPurchase,
      GoldPrice,
      GoldDocument,
      GoldExtractionItem,
      GoldPriceCapture,
      GoldPriceScreenshot,
    ]),
  ],
  controllers: [GoldDocumentController, GoldPriceCaptureController],
  providers: [
    GoldService,
    GoldDocumentService,
    GoldExtractionService,
    GoldPriceCaptureService,
    ImageTextExtractorService,
    GoldResolver,
  ],
  exports: [
    GoldService,
    GoldDocumentService,
    GoldExtractionService,
    GoldPriceCaptureService,
  ],
})
export class GoldModule {}
