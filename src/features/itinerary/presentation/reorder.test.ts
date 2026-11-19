import { ACTIVITY_ROW_HEIGHT, dropIndexFor, moveItem } from './reorder';

describe('moveItem', () => {
  const ids = ['a', 'b', 'c', 'd'] as const;

  it('moves an item down and up', () => {
    expect(moveItem(ids, 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(ids, 3, 1)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('returns an unchanged copy when the position does not change', () => {
    const moved = moveItem(ids, 2, 2);
    expect(moved).toEqual(ids);
    expect(moved).not.toBe(ids);
  });

  it('clamps positions past either end', () => {
    expect(moveItem(ids, 1, 10)).toEqual(['a', 'c', 'd', 'b']);
    expect(moveItem(ids, 2, -3)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('never changes the original list', () => {
    const original = ['a', 'b'];
    moveItem(original, 0, 1);
    expect(original).toEqual(['a', 'b']);
  });
});

describe('dropIndexFor', () => {
  const row = ACTIVITY_ROW_HEIGHT;

  it('moves by whole rows, rounding to the nearest', () => {
    expect(dropIndexFor(2 * row, row, 0, 4)).toBe(2);
    expect(dropIndexFor(-row, row, 2, 4)).toBe(1);
    expect(dropIndexFor(0.6 * row, row, 1, 4)).toBe(2);
    expect(dropIndexFor(0.4 * row, row, 1, 4)).toBe(1);
  });

  it('stays within the list', () => {
    expect(dropIndexFor(10 * row, row, 1, 4)).toBe(3);
    expect(dropIndexFor(-10 * row, row, 1, 4)).toBe(0);
  });
});
