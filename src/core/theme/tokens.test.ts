import { createTypography, typography, type TypographyVariant } from './tokens';

const VARIANTS = Object.keys(typography) as TypographyVariant[];

describe('createTypography', () => {
  it('TC-05 keeps the type scale unchanged for left-to-right scripts', () => {
    expect(createTypography({ rtlScript: false })).toEqual(typography);
  });

  it.each(VARIANTS)('TC-05 drops letter spacing and case transforms for Urdu (%s)', (variant) => {
    const style = createTypography({ rtlScript: true })[variant];

    expect(style.letterSpacing ?? 0).toBe(0);
    expect(style.textTransform ?? 'none').toBe('none');
    expect(style.fontSize).toBe(typography[variant].fontSize);
  });

  it.each(VARIANTS)('TC-05 gives Urdu taller lines on the 4pt grid (%s)', (variant) => {
    const lineHeight = createTypography({ rtlScript: true })[variant].lineHeight ?? 0;

    expect(lineHeight).toBeGreaterThan(typography[variant].lineHeight);
    expect(lineHeight % 4).toBe(0);
  });
});
