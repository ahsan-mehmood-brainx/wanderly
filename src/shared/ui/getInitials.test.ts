import { getInitials } from './getInitials';

describe('getInitials', () => {
  it.each([
    ['Amelia Earhart', 'AE'],
    ['Ana María López', 'AL'],
    ['  marco   polo  ', 'MP'],
    ['Zheng', 'Z'],
    ['élodie durand', 'ÉD'],
    ['🙂 Traveller', '🙂T'],
    ['', ''],
    ['   ', ''],
  ])('%j → %j', (name, expected) => {
    expect(getInitials(name)).toBe(expected);
  });
});
