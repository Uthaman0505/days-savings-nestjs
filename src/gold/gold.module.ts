import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GoldDocumentController } from './gold-document.controller';
import { GoldDocument } from './gold-document.entity';
import { GoldExtractionItem } from './gold-extraction-item.entity';
import { GoldDocumentService } from './gold-document.service';
import { GoldExtractionService } from './gold-extraction.service';
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
    ]),
  ],
  controllers: [GoldDocumentController],
  providers: [
    GoldService,
    GoldDocumentService,
    GoldExtractionService,
    GoldResolver,
  ],
  exports: [GoldService, GoldDocumentService, GoldExtractionService],
})
export class GoldModule {}
