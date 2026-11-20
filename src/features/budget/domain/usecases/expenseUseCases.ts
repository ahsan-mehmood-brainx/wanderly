import { AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';
import { type UseCase } from '@/core/usecase/UseCase';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';
import { compareLocalDates, type LocalDate, localDateAt } from '@/features/trips/domain/localDate';
import { type TripOwnerProvider, type TripRepository } from '@/features/trips/domain/repositories';
import { type StoredTrip } from '@/features/trips/domain/Trip';

import { type ExchangeRateInfo } from '../ExchangeRate';
import { type Expense, type ExpenseDraft, type ExpenseInput } from '../Expense';
import { type ExpenseValidationErrors, validateExpenseInput } from '../expenseValidation';
import { type ExchangeRateRepository, type ExpenseConversionUpdate, type ExpenseRepository } from '../repositories';
import { type Conversion, type ExpenseConverter, isUnsupportedPair, UNCONVERTED } from './ExpenseConverter';

export type SaveExpenseOutcome =
  | { readonly status: 'saved'; readonly expense: Expense }
  /** Nothing was saved; the form shows these errors. */
  | { readonly status: 'invalid'; readonly errors: ExpenseValidationErrors }
  /** Nothing was saved (`storage`, `notFound` when the trip or expense is gone, `unauthorized` when signed out). */
  | { readonly status: 'failed'; readonly error: AppError };

export interface CreateExpenseInput {
  readonly tripId: string;
  readonly input: ExpenseInput;
}

export interface UpdateExpenseInput {
  readonly id: string;
  readonly input: ExpenseInput;
}

export interface TripBudget {
  readonly trip: StoredTrip;
  /** By date, then `createdAt`. */
  readonly expenses: readonly Expense[];
}

export interface PreviewExchangeRateInput {
  readonly from: string;
  readonly to: string;
  readonly date: LocalDate;
  readonly signal?: AbortSignal;
}

/**
 * The account to act for, read once per operation so every step applies to the
 * same account even if the session changes meanwhile.
 */
function requireOwner(owners: TripOwnerProvider): Result<string, AppError> {
  const ownerId = owners.currentOwnerId();
  return ownerId === null ? err(new AppError('unauthorized', 'No signed-in account for the budget')) : ok(ownerId);
}

async function requireTrip(
  trips: TripRepository,
  ownerId: string,
  tripId: string,
): Promise<Result<StoredTrip, AppError>> {
  const found = await trips.findById(ownerId, tripId);
  if (!found.ok) return found;
  return found.value ? ok(found.value) : err(new AppError('notFound', `Trip ${tripId} not found`));
}

async function requireExpense(
  expenses: ExpenseRepository,
  ownerId: string,
  id: string,
): Promise<Result<Expense, AppError>> {
  const found = await expenses.findById(ownerId, id);
  if (!found.ok) return found;
  return found.value ? ok(found.value) : err(new AppError('notFound', `Expense ${id} not found`));
}

/** True when the expense has no amount in the trip's current currency. */
function needsConversion(expense: Expense, tripCurrency: string): boolean {
  return expense.baseCurrency !== tripCurrency || expense.baseAmount === null;
}

/**
 * True when the stored conversion may be only an approximation that a budget load
 * should try to replace: a fallback (nearest earlier cached) rate, or, once the
 * expense's date has passed, an API rate dated before it (the latest rate used ahead
 * of the date, or the day before because the date's rate wasn't published yet).
 *
 * Only the rate itself is looked at, never `updatedAt`: editing an expense's title or
 * notes must not stop it from getting its date's rate. A weekend or holiday expense
 * also has an earlier-dated rate; its lookup is answered by the rate cache and,
 * finding the same rate, saves nothing (see {@link sameConversion}).
 */
function needsBetterRate(expense: Expense, today: LocalDate): boolean {
  const rate = expense.exchangeRate;
  if (rate === null || rate.source === 'manual' || rate.source === 'identity') return false;
  if (rate.source === 'fallback') return true;
  return compareLocalDates(rate.rateDate, expense.date) < 0 && compareLocalDates(expense.date, today) < 0;
}

/** True when `conversion` is exactly what the expense already stores. */
function sameConversion(expense: Expense, conversion: Conversion): boolean {
  const stored = expense.exchangeRate;
  const found = conversion.exchangeRate;
  return (
    expense.baseAmount === conversion.baseAmount &&
    stored !== null &&
    found !== null &&
    stored.rate === found.rate &&
    stored.rateDate === found.rateDate &&
    stored.source === found.source
  );
}

/** The draft's fields that are stored on the expense (a typed rate is only used to convert). */
function storedFields(draft: ExpenseDraft) {
  return {
    title: draft.title,
    amount: draft.amount,
    currency: draft.currency,
    category: draft.category,
    date: draft.date,
    paymentMethod: draft.paymentMethod,
    notes: draft.notes,
  };
}

function convert(converter: ExpenseConverter, draft: ExpenseDraft, baseCurrency: string): Promise<Conversion> {
  return converter.convert({
    amount: draft.amount,
    currency: draft.currency,
    baseCurrency,
    date: draft.date,
    manualRate: draft.manualRate,
  });
}

/**
 * The trip and its expenses exactly as stored, without converting anything, so
 * screens that only list or show expenses never wait on the exchange-rate API.
 */
export class GetTripExpenses implements UseCase<string, Result<TripBudget, AppError>> {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly trips: TripRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(tripId: string): Promise<Result<TripBudget, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const trip = await requireTrip(this.trips, owner.value, tripId);
    if (!trip.ok) return trip;
    const listed = await this.expenses.listByTrip(owner.value, tripId);
    if (!listed.ok) return listed;
    return ok({ trip: trip.value, expenses: listed.value });
  }
}

/**
 * The trip and its expenses. Expenses not in the trip's currency, or not converted
 * yet, are converted again first and saved; any that still can't be stay unconverted.
 */
export class GetTripBudget implements UseCase<string, Result<TripBudget, AppError>> {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly trips: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly converter: ExpenseConverter,
    private readonly clock: Clock,
  ) {}

  async execute(tripId: string): Promise<Result<TripBudget, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    const ownerId = owner.value;

    const trip = await requireTrip(this.trips, ownerId, tripId);
    if (!trip.ok) return trip;
    const listed = await this.expenses.listByTrip(ownerId, tripId);
    if (!listed.ok) return listed;

    const { currency } = trip.value;
    const updates: ExpenseConversionUpdate[] = [];
    const now = this.clock.now();
    const today = localDateAt(now);
    // The rate found for each currency and date on this load (null when none), so
    // expenses sharing them make one lookup, and a failed lookup is not repeated.
    const ratesSeen = new Map<string, ExchangeRateInfo | null>();
    for (const item of listed.value) {
      const missing = needsConversion(item, currency);
      if (!missing && !needsBetterRate(item, today)) continue;
      const request = {
        amount: item.amount,
        currency: item.currency,
        baseCurrency: currency,
        date: item.date,
        manualRate: null,
      };
      const key = `${item.currency}|${item.date}`;
      const seen = ratesSeen.get(key);
      let conversion: Conversion;
      if (seen === undefined) {
        conversion = await this.converter.convert(request);
        ratesSeen.set(key, conversion.exchangeRate);
      } else {
        conversion = seen === null ? UNCONVERTED : this.converter.convertAt(request, seen);
      }
      // Never make a stored amount worse: keep it when no rate, or only another approximate one, was found.
      const noBetter = conversion.baseAmount === null || (!missing && conversion.exchangeRate?.source === 'fallback');
      if (noBetter && item.baseCurrency === currency) continue;
      // Re-checked and found the same rate (e.g. a weekend expense): nothing to save.
      if (!missing && sameConversion(item, conversion)) continue;
      updates.push({
        id: item.id,
        baseCurrency: currency,
        ...conversion,
        updatedAt: now,
        basis: { amount: item.amount, currency: item.currency, date: item.date, baseCurrency: item.baseCurrency },
      });
    }
    if (updates.length === 0) return ok({ trip: trip.value, expenses: listed.value });

    const saved = await this.expenses.updateConversions(ownerId, updates);
    // Showing what's stored keeps the UI a mirror of SQLite; the next load tries again.
    if (!saved.ok) return ok({ trip: trip.value, expenses: listed.value });

    const byId = new Map(updates.map(({ basis: _basis, ...update }) => [update.id, update]));
    const expenses = listed.value.map((item) => {
      const update = byId.get(item.id);
      return update ? { ...item, ...update } : item;
    });
    return ok({ trip: trip.value, expenses });
  }
}

export class GetExpense implements UseCase<string, Result<Expense, AppError>> {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(id: string): Promise<Result<Expense, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    return requireExpense(this.expenses, owner.value, id);
  }
}

/** Validates, converts (never failing on conversion) and saves a new expense. */
export class CreateExpense implements UseCase<CreateExpenseInput, SaveExpenseOutcome> {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly trips: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly converter: ExpenseConverter,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async execute({ tripId, input }: CreateExpenseInput): Promise<SaveExpenseOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    const ownerId = owner.value;

    const trip = await requireTrip(this.trips, ownerId, tripId);
    if (!trip.ok) return { status: 'failed', error: trip.error };

    const validation = validateExpenseInput(input);
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };
    const conversion = await convert(this.converter, validation.draft, trip.value.currency);
    const now = this.clock.now();
    const expense: Expense = {
      id: this.idGenerator(),
      tripId,
      ...storedFields(validation.draft),
      baseCurrency: trip.value.currency,
      ...conversion,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.expenses.insert(ownerId, expense);
    if (!saved.ok) return { status: 'failed', error: saved.error };
    return { status: 'saved', expense };
  }
}

/** Saves changes; converts again when the amount, currency or date changed. */
export class UpdateExpense implements UseCase<UpdateExpenseInput, SaveExpenseOutcome> {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly trips: TripRepository,
    private readonly owners: TripOwnerProvider,
    private readonly converter: ExpenseConverter,
    private readonly clock: Clock,
  ) {}

  async execute({ id, input }: UpdateExpenseInput): Promise<SaveExpenseOutcome> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return { status: 'failed', error: owner.error };
    const ownerId = owner.value;

    const existing = await requireExpense(this.expenses, ownerId, id);
    if (!existing.ok) return { status: 'failed', error: existing.error };
    const previous = existing.value;

    const trip = await requireTrip(this.trips, ownerId, previous.tripId);
    if (!trip.ok) return { status: 'failed', error: trip.error };

    const validation = validateExpenseInput(input);
    if (!validation.ok) return { status: 'invalid', errors: validation.errors };
    const draft = storedFields(validation.draft);
    const { manualRate } = validation.draft;
    const baseCurrency = trip.value.currency;

    const changed =
      draft.amount !== previous.amount || draft.currency !== previous.currency || draft.date !== previous.date;
    const newManualRate =
      manualRate !== null && previous.exchangeRate?.source === 'manual' && previous.exchangeRate.rate !== manualRate;
    const conversion: Conversion =
      changed || newManualRate || needsConversion(previous, baseCurrency)
        ? await convert(this.converter, validation.draft, baseCurrency)
        : { baseAmount: previous.baseAmount, exchangeRate: previous.exchangeRate };

    const expense: Expense = {
      ...previous,
      ...draft,
      baseCurrency,
      ...conversion,
      updatedAt: this.clock.now(),
    };
    const saved = await this.expenses.update(ownerId, expense);
    if (!saved.ok) return { status: 'failed', error: saved.error };
    return { status: 'saved', expense };
  }
}

export class DeleteExpense implements UseCase<string, Result<void, AppError>> {
  constructor(
    private readonly expenses: ExpenseRepository,
    private readonly owners: TripOwnerProvider,
  ) {}

  async execute(id: string): Promise<Result<void, AppError>> {
    const owner = requireOwner(this.owners);
    if (!owner.ok) return owner;
    return this.expenses.delete(owner.value, id);
  }
}

/** The rate the form shows while an amount in another currency is typed. */
export class PreviewExchangeRate implements UseCase<PreviewExchangeRateInput, Result<ExchangeRateInfo, AppError>> {
  constructor(private readonly rates: ExchangeRateRepository) {}

  async execute({ from, to, date, signal }: PreviewExchangeRateInput): Promise<Result<ExchangeRateInfo, AppError>> {
    if (from === to) return ok({ rate: '1', rateDate: date, source: 'identity' });
    // No network lookup for a currency the API doesn't publish: the form asks for a rate.
    if (await isUnsupportedPair(this.rates, from, to, signal)) {
      return err(new AppError('notFound', `No published rate for ${from} to ${to}`));
    }
    return this.rates.getRate(from, to, date, signal);
  }
}
