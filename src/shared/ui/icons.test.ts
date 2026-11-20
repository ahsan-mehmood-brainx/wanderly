import { icons } from './icons';

describe('icons', () => {
  it.each(['ios', 'android', 'web'] as const)(
    'draws saved and unsaved favorites with different glyphs on %s, not only a different color',
    (platform) => {
      expect(icons.favoriteFilled[platform]).not.toBe(icons.favorite[platform]);
    },
  );
});
