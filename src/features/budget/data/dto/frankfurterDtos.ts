import { z } from 'zod';

/** `GET /latest` and `GET /{YYYY-MM-DD}` with `base` and `symbols`. */
export const ratesDtoSchema = z.object({
  amount: z.number(),
  base: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  rates: z.record(z.string(), z.number().positive()),
});

export type RatesDto = z.infer<typeof ratesDtoSchema>;

/** `GET /currencies`: code to name. */
export const currenciesDtoSchema = z.record(z.string(), z.string());

export type CurrenciesDto = z.infer<typeof currenciesDtoSchema>;
