import { type AppError } from '@/core/errors/AppError';
import { err, ok, type Result } from '@/core/result';

import { type DescriptionState } from '../Destination';
import { type PlaceContentRepository } from '../repositories';

/**
 * Finds the first article among `titles` that has a usable summary.
 *
 * Several titles are tried because names are ambiguous: "Georgia" is a
 * disambiguation page (the country is "Georgia (country)") and "Kingston" needs
 * its country ("Kingston, Jamaica"). A missing description is a normal outcome,
 * not an error; a failed request stops the search and is reported as `failed`
 * so the page can still render. Only cancellation is returned as an error, so
 * nothing half-loaded is cached.
 */
export async function describePlace(
  content: Pick<PlaceContentRepository, 'getSummary'>,
  titles: readonly (string | null | undefined)[],
  signal?: AbortSignal,
): Promise<Result<DescriptionState, AppError>> {
  const candidates = [...new Set(titles.filter((title): title is string => Boolean(title?.trim())))];
  for (const title of candidates) {
    const result = await content.getSummary(title, signal);
    if (!result.ok) {
      if (result.error.kind === 'cancelled') return err(result.error);
      return ok({ status: 'failed', errorKind: result.error.kind });
    }
    if (result.value) return ok({ status: 'available', summary: result.value });
  }
  return ok({ status: 'missing' });
}
