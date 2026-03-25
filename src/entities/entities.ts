import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { SavingPlan } from '../plans/saving-plan.entity';
import { User } from '../user/user.entity';
import { UserSavingPlan } from '../plans/user-saving-plan.entity';

export const entities = [User, RefreshToken, SavingPlan, UserSavingPlan];
