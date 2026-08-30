import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { SavingPlan } from '../plans/saving-plan.entity';
import { User } from '../user/user.entity';
import { UserSavingPlan } from '../plans/user-saving-plan.entity';
import { GlobalWallet } from '../wallet/global-wallet.entity';
import { ChallengeWallet } from '../wallet/challenge-wallet.entity';
import { WalletTransaction } from '../wallet/wallet-transaction.entity';
import { DailyChallengeClaim } from '../wallet/daily-challenge-claim.entity';
import { CompletedChallenge } from '../wallet/completed-challenge.entity';
import { GiveUpChallenge } from '../wallet/give-up-challenge.entity';
import { DailyTransactionLeverage } from '../wallet/daily-transaction-leverage.entity';
import { YearlyChallengeReset } from '../wallet/yearly-challenge-reset.entity';
import { GrabProfitEntry } from '../grab-profit/grab-profit-entry.entity';
import { Account } from '../account/account.entity';
import { Category } from '../category/category.entity';
import { Transaction } from '../transaction/transaction.entity';
import { Income } from '../income/income.entity';
import { Expense } from '../expense/expense.entity';
import { Transfer } from '../transfer/transfer.entity';
import { CreditCard } from '../credit-card/credit-card.entity';
import { CreditCardPayment } from '../credit-card-payment/credit-card-payment.entity';
import { HouseLoan } from '../house-loan/house-loan.entity';
import { HouseLoanPayment } from '../house-loan-payment/house-loan-payment.entity';
import { Insurance } from '../insurance/insurance.entity';
import { InsurancePayment } from '../insurance-payment/insurance-payment.entity';
import { FamilyLoan } from '../family-loan/family-loan.entity';
import { FamilyLoanPayment } from '../family-loan-payment/family-loan-payment.entity';
import { Savings } from '../savings/savings.entity';
import { Goal } from '../goals/goals.entity';
import { GoalContribution } from '../goals/goal-contribution.entity';
import { RecurringTransaction } from '../recurring-transaction/recurring-transaction.entity';
import { PawnLoan } from '../pawn-loan/pawn-loan.entity';
import { PawnCollateral } from '../pawn-loan/pawn-collateral.entity';
import { PawnPayment } from '../pawn-loan/pawn-payment.entity';
import { PawnRenewal } from '../pawn-loan/pawn-renewal.entity';
import { PawnTransaction } from '../pawn-loan/pawn-transaction.entity';
import { SalaryPlan } from '../mission-control/salary-plan.entity';
import { SalaryAllocation } from '../mission-control/salary-allocation.entity';
import { DebtPriority } from '../mission-control/debt-priority.entity';
import { FinancialMission } from '../mission-control/financial-mission.entity';
import { MonthlySnapshot } from '../mission-control/monthly-snapshot.entity';
import { ProjectionSettings } from '../mission-control/projection-settings.entity';
import { GoldDocument } from '../gold/gold-document.entity';
import { GoldExtractionItem } from '../gold/gold-extraction-item.entity';
import { GoldPriceCapture } from '../gold/gold-price-capture.entity';
import { GoldPriceScreenshot } from '../gold/gold-price-screenshot.entity';
import { GoldPurchase } from '../gold/gold-purchase.entity';
import { GoldPrice } from '../gold/gold-price.entity';

export const entities = [
  User,
  RefreshToken,
  SavingPlan,
  UserSavingPlan,
  GlobalWallet,
  ChallengeWallet,
  WalletTransaction,
  DailyChallengeClaim,
  CompletedChallenge,
  GiveUpChallenge,
  DailyTransactionLeverage,
  YearlyChallengeReset,
  GrabProfitEntry,
  Account,
  Category,
  Transaction,
  Income,
  Expense,
  Transfer,
  CreditCard,
  CreditCardPayment,
  HouseLoan,
  HouseLoanPayment,
  Insurance,
  InsurancePayment,
  FamilyLoan,
  FamilyLoanPayment,
  Savings,
  Goal,
  GoalContribution,
  RecurringTransaction,
  PawnLoan,
  PawnCollateral,
  PawnPayment,
  PawnRenewal,
  PawnTransaction,
  SalaryPlan,
  SalaryAllocation,
  DebtPriority,
  FinancialMission,
  MonthlySnapshot,
  ProjectionSettings,
  GoldPurchase,
  GoldPrice,
  GoldDocument,
  GoldExtractionItem,
  GoldPriceCapture,
  GoldPriceScreenshot,
];
