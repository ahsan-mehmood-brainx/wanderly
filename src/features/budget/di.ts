import { type CoreDependencies } from '@/core/di/CoreDependencies';
import { type Factories } from '@/core/di/createContainer';
import { type AppError } from '@/core/errors/AppError';
import { type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type TripsDependencies } from '@/features/trips/di';

import { CachedExchangeRateRepository } from './data/CachedExchangeRateRepository';
import { FRANKFURTER_API } from './data/frankfurterApi';
import { FrankfurterExchangeRateRepository } from './data/FrankfurterExchangeRateRepository';
import { LocalExchangeRateCache } from './data/LocalExchangeRateCache';
import { LocalExpenseRepository } from './data/LocalExpenseRepository';
import { type ExchangeRateInfo } from './domain/ExchangeRate';
import { type Expense } from './domain/Expense';
import { type ExchangeRateRepository, type ExpenseRepository } from './domain/repositories';
import { ExpenseConverter } from './domain/usecases/ExpenseConverter';
import {
  CreateExpense,
  type CreateExpenseInput,
  DeleteExpense,
  GetExpense,
  GetTripBudget,
  GetTripExpenses,
  PreviewExchangeRate,
  type PreviewExchangeRateInput,
  type SaveExpenseOutcome,
  type TripBudget,
  UpdateExpense,
  type UpdateExpenseInput,
} from './domain/usecases/expenseUseCases';

export interface BudgetDependencies {
  readonly expenseRepository: ExpenseRepository;
  readonly exchangeRateCache: LocalExchangeRateCache;
  readonly exchangeRateRepository: ExchangeRateRepository;
  readonly expenseConverter: ExpenseConverter;
  readonly getTripBudget: UseCase<string, Result<TripBudget, AppError>>;
  readonly getTripExpenses: UseCase<string, Result<TripBudget, AppError>>;
  readonly getExpense: UseCase<string, Result<Expense, AppError>>;
  readonly createExpense: UseCase<CreateExpenseInput, SaveExpenseOutcome>;
  readonly updateExpense: UseCase<UpdateExpenseInput, SaveExpenseOutcome>;
  readonly deleteExpense: UseCase<string, Result<void, AppError>>;
  readonly previewExchangeRate: UseCase<PreviewExchangeRateInput, Result<ExchangeRateInfo, AppError>>;
}

export const budgetFactories: Factories<
  BudgetDependencies,
  CoreDependencies & Pick<TripsDependencies, 'tripRepository' | 'tripOwnerProvider'> & BudgetDependencies
> = {
  expenseRepository: (c) => new LocalExpenseRepository(c.database, c.logger.child({ scope: 'budget' })),
  exchangeRateCache: (c) => new LocalExchangeRateCache(c.database, c.logger.child({ scope: 'budget' })),
  exchangeRateRepository: (c) =>
    new CachedExchangeRateRepository(
      new FrankfurterExchangeRateRepository(c.httpClientFactory.create(FRANKFURTER_API), c.clock),
      c.exchangeRateCache,
      c.clock,
      c.keyValueStore,
    ),
  expenseConverter: (c) => new ExpenseConverter(c.exchangeRateRepository),
  getTripBudget: (c) =>
    new GetTripBudget(c.expenseRepository, c.tripRepository, c.tripOwnerProvider, c.expenseConverter, c.clock),
  getTripExpenses: (c) => new GetTripExpenses(c.expenseRepository, c.tripRepository, c.tripOwnerProvider),
  getExpense: (c) => new GetExpense(c.expenseRepository, c.tripOwnerProvider),
  createExpense: (c) =>
    new CreateExpense(
      c.expenseRepository,
      c.tripRepository,
      c.tripOwnerProvider,
      c.expenseConverter,
      c.clock,
      c.idGenerator,
    ),
  updateExpense: (c) =>
    new UpdateExpense(c.expenseRepository, c.tripRepository, c.tripOwnerProvider, c.expenseConverter, c.clock),
  deleteExpense: (c) => new DeleteExpense(c.expenseRepository, c.tripOwnerProvider),
  previewExchangeRate: (c) => new PreviewExchangeRate(c.exchangeRateRepository),
};
