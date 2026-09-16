import { IsIn, IsOptional, IsString, Matches } from 'class-validator';

const MONEY = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

export class UpsertLunoBtcBudgetDto {
  @IsString()
  @Matches(MONEY, { message: 'monthlyBudgetMyr must be a decimal string.' })
  monthlyBudgetMyr: string;

  @IsOptional()
  @IsString()
  @Matches(MONEY, {
    message: 'normalBuyAllocationMyr must be a decimal string.',
  })
  normalBuyAllocationMyr?: string | null;

  @IsOptional()
  @IsString()
  @Matches(MONEY, {
    message: 'dipReserveAllocationMyr must be a decimal string.',
  })
  dipReserveAllocationMyr?: string | null;
}

export class AllocateLunoBtcMoneyBucketDto {
  @IsIn(['PROTECTED_PROFIT', 'REINVESTMENT_RESERVE'])
  bucketType: 'PROTECTED_PROFIT' | 'REINVESTMENT_RESERVE';

  @IsString()
  @Matches(MONEY, { message: 'amountMyr must be a decimal string.' })
  amountMyr: string;

  @IsOptional()
  @IsString()
  note?: string | null;

  @IsOptional()
  @IsString()
  sourceReference?: string | null;
}
