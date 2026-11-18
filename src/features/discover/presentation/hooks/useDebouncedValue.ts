import { useEffect, useState } from 'react';

/** Default delay for search-as-you-type: long enough to skip intermediate keystrokes, short enough to feel live. */
export const SEARCH_DEBOUNCE_MS = 350;

/**
 * Returns `value` once it has stopped changing for `delayMs`. `isPending` is true
 * while a newer value is waiting, so the UI can show it is about to search.
 */
export function useDebouncedValue<T>(value: T, delayMs: number = SEARCH_DEBOUNCE_MS): readonly [T, boolean] {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return [debounced, !Object.is(debounced, value)] as const;
}
