/** Every row in the reorderable day list has this height, so drag offsets map to positions. */
export const ACTIVITY_ROW_HEIGHT = 88;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** A copy of `items` with the item at `from` moved to `to` (indices are clamped to the list). */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  const copy = [...items];
  if (copy.length === 0) return copy;
  const last = copy.length - 1;
  const [moved] = copy.splice(clamp(from, 0, last), 1);
  if (moved === undefined) return copy;
  copy.splice(clamp(to, 0, last), 0, moved);
  return copy;
}

/** The index a row dragged from `from` by `translationY` points would land on, within `0..count-1`. */
export function dropIndexFor(translationY: number, rowHeight: number, from: number, count: number): number {
  'worklet';
  const target = from + Math.round(translationY / rowHeight);
  return Math.min(Math.max(target, 0), Math.max(count - 1, 0));
}
