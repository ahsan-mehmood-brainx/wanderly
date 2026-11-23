import { createI18n } from '../createI18n';
import { en, type TranslationResources } from './en';
import { es } from './es';
import { ur } from './ur';

type Tree = { readonly [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ''): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string' ? [[`${prefix}${key}`, value]] : leaves(value, `${prefix}${key}.`),
  );
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/{{\s*([\w.]+)\s*}}/g)].map((match) => match[1] ?? '').sort();
}

const english = new Map(leaves(en));
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

describe.each<[string, TranslationResources]>([
  ['es', es],
  ['ur', ur],
])('the %s locale', (_code, locale) => {
  const translated = new Map(leaves(locale));

  it('TC-04 has exactly the English keys', () => {
    expect([...translated.keys()].sort()).toEqual([...english.keys()].sort());
  });

  it('TC-04 keeps every {{placeholder}} of the English text', () => {
    const mismatched = [...english].filter(
      ([key, text]) => JSON.stringify(placeholders(text)) !== JSON.stringify(placeholders(translated.get(key) ?? '')),
    );
    expect(mismatched.map(([key]) => key)).toEqual([]);
  });

  it('TC-04 has no empty strings', () => {
    const empty = [...english.keys()].filter((key) => (translated.get(key) ?? '').trim() === '');
    expect(empty).toEqual([]);
  });
});

describe('the Urdu locale', () => {
  it('TC-04 is written in Urdu script', () => {
    const entries = leaves(ur);
    const inUrdu = entries.filter(([, text]) => ARABIC_SCRIPT.test(text));
    expect(entries.length).toBeGreaterThan(0);
    expect(inUrdu.length / entries.length).toBeGreaterThan(0.9);
  });

  it('TC-01 is registered with i18n', () => {
    const i18n = createI18n('ur');

    expect(i18n.t('settings.title')).toMatch(ARABIC_SCRIPT);
    expect(i18n.t('settings.appearance.title')).not.toBe(en.settings.appearance.title);
    expect(i18n.t('settings.appearance.title')).toMatch(ARABIC_SCRIPT);
  });
});
