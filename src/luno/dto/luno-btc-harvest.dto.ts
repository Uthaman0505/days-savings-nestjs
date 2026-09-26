import { IsOptional, IsString, Matches } from 'class-validator';

const MONEY = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export class PatchLunoBtcHarvestSettingsDto {
  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'minimumHarvestMyr must be a decimal string.' })
  minimumHarvestMyr?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, {
    message: 'estimatedSellFeeMyr must be a decimal string.',
  })
  estimatedSellFeeMyr?: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, { message: 'minimumCorePct must be a decimal string.' })
  minimumCorePct?: string;
}
