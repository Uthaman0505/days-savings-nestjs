export const LUNO_COST_BASIS_METHOD = 'FIFO' as const;

export type BtcAccountingKind =
  | 'BTC_BUY'
  | 'BTC_SELL'
  | 'BTC_BUY_FEE'
  | 'BTC_SELL_FEE'
  | 'BTC_DEPOSIT'
  | 'BTC_WITHDRAWAL'
  | 'MYR_DEPOSIT'
  | 'MYR_WITHDRAWAL'
  | 'INTERNAL_TRANSFER'
  | 'UNKNOWN';

export type FeeStatus = 'KNOWN' | 'PARTIAL' | 'UNKNOWN' | 'NONE';
export type TradeFeeStatus = 'EXACT' | 'DERIVED' | 'MISSING' | 'UNKNOWN';
export type TradeChannel = 'INSTANT' | 'EXCHANGE' | 'UNKNOWN';
export type FeeTreatment =
  | 'EMBEDDED'
  | 'ADDED_TO_MYR_COST'
  | 'SUBTRACTED_FROM_PROCEEDS'
  | 'NONE';
export type FeeSource =
  | 'STATEMENT_FEE_ROW'
  | 'INSTANT_DETAILS'
  | 'ORDER_FEE_COUNTER'
  | 'USER_TRADE'
  | 'NONE';
export type AccountingReadiness =
  | 'READY'
  | 'APPROVED_PARTIAL'
  | 'PARTIAL'
  | 'NOT_READY';
export type ReconciliationStatus =
  | 'MATCHED'
  | 'SMALL_ROUNDING_DIFFERENCE'
  | 'MISMATCH';
export type ContributionConfidence = 'HIGH' | 'PARTIAL' | 'UNKNOWN';
export type FeeImpactStatus = 'EXACT' | 'BOUNDED' | 'UNKNOWN';

export type SourceTx = {
  id: string;
  lunoAccountId: string;
  rowIndex: string;
  reference: string | null;
  currency: string;
  kind: string | null;
  description: string | null;
  balanceDelta: string;
  occurredAt: Date;
  details?: Record<string, string> | null;
  rawPayload?: Record<string, unknown> | null;
};

export type ClassifiedEvent = {
  classification: BtcAccountingKind;
  occurredAt: Date;
  reference: string | null;
  sourceTransactionIds: string[];
  btcQuantity: string;
  btcDirection: 'IN' | 'OUT' | 'NONE';
  myrAmount: string;
  /** Cash-applied MYR fee. Zero when the fee is already embedded. */
  feeMyr: string;
  /** Known MYR fee for audit, including Instant BTC-fee × price. */
  feeMyrReported: string;
  feeBtc: string | null;
  feeStatus: TradeFeeStatus;
  feeSource: FeeSource;
  feeTreatment: FeeTreatment;
  tradeChannel: TradeChannel;
  derivationNote: string | null;
  warning: string | null;
};

export type FifoLot = {
  key: string;
  sourceTransactionId: string | null;
  reference: string | null;
  acquiredAt: Date;
  btcQuantityOriginal: string;
  btcQuantityRemaining: string;
  myrCostOriginal: string;
  myrCostRemaining: string;
  feeMyr: string;
  effectiveCostMyr: string;
  origin: 'BUY' | 'DEPOSIT' | 'TRANSFER_IN';
};

export type DisposalLotUse = {
  lotKey: string;
  btcQuantityConsumed: string;
  costBasisConsumedMyr: string;
};

export type FifoDisposal = {
  key: string;
  sourceTransactionId: string | null;
  reference: string | null;
  disposedAt: Date;
  kind: 'SELL' | 'WITHDRAWAL' | 'TRANSFER_OUT';
  btcQuantity: string;
  grossProceedsMyr: string;
  feeMyr: string;
  netProceedsMyr: string;
  costBasisMyr: string;
  realisedPnlMyr: string;
  lotsUsed: DisposalLotUse[];
};

export type FeeCoverage = {
  knownFeesMyr: string;
  feeCoveragePct: string | null;
  missingFeeTransactions: number;
  exactFeeTransactions: number;
  derivedFeeTransactions: number;
  unknownFeeTransactions: number;
  tradeCount: number;
  affectedGrossAmountMyr: string;
  impactStatus: FeeImpactStatus;
  estimatedMinAccountingImpactMyr: string | null;
  estimatedMaxAccountingImpactMyr: string | null;
};

export type FeeAuditRow = {
  occurredAt: string;
  type: 'BTC_BUY' | 'BTC_SELL';
  channel: TradeChannel;
  reference: string | null;
  btcQuantity: string;
  grossMyr: string;
  feeMyr: string;
  feeBtc: string | null;
  feeStatus: TradeFeeStatus;
  feeSource: FeeSource;
  feeTreatment: FeeTreatment;
  accountingImpact: string;
  derivationNote: string | null;
};

export type BtcPortfolioView = {
  status: AccountingReadiness;
  strategyReady: boolean;
  costBasisMethod: typeof LUNO_COST_BASIS_METHOD;
  btcQuantity: string;
  btcPriceMyr: string | null;
  currentValueMyr: string | null;
  moneyPutInMyr: string;
  remainingCostBasisMyr: string;
  averageBuyPriceMyr: string | null;
  breakEvenPriceMyr: string | null;
  profitStillInsideBtcMyr: string | null;
  profitAlreadyTakenMyr: string;
  lifetimeProfitMyr: string | null;
  principalRecoveredMyr: string;
  principalRecoveryPct: string | null;
  principalRecoveryPctRaw: string | null;
  overallReturnPct: string | null;
  totalBtcBought: string;
  totalBtcSold: string;
  totalBuyFeesMyr: string;
  totalSellFeesMyr: string;
  feeStatus: FeeStatus;
  feeCoverage: FeeCoverage;
  externalContributionMyr: string;
  reinvestedMyr: string;
  externalContributionConfidence: ContributionConfidence;
  reconciliation: {
    status: ReconciliationStatus;
    differenceBtc: string;
    liveBtcBalance: string | null;
    calculatedBtcQuantity: string;
  };
  warnings: string[];
};

export const BTC_DUST_TOLERANCE = '0.00000001';
