/**
 * Up to two initials from a display name: first letter of the first and last
 * words ("Ana María López" → "AL"). Handles emoji and accented letters, and
 * returns an empty string when there is nothing usable.
 */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const first = words[0];
  if (first === undefined) return '';
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  const initial = (word: string) => Array.from(word)[0] ?? '';
  return (initial(first) + (last ? initial(last) : '')).toLocaleUpperCase();
}
