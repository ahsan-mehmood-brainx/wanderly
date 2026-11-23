import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { layoutDirectionOf, type LayoutDirection, type SupportedLanguage } from './languages';

export interface LayoutDirectionValue {
  readonly direction: LayoutDirection;
  readonly isRTL: boolean;
}

const LTR: LayoutDirectionValue = { direction: 'ltr', isRTL: false };

const LayoutDirectionContext = createContext<LayoutDirectionValue>(LTR);

interface LayoutDirectionProviderProps {
  readonly language: SupportedLanguage;
  readonly children: ReactNode;
}

export function LayoutDirectionProvider({ language, children }: LayoutDirectionProviderProps) {
  const direction = layoutDirectionOf(language);
  const value = useMemo<LayoutDirectionValue>(() => ({ direction, isRTL: direction === 'rtl' }), [direction]);
  return <LayoutDirectionContext.Provider value={value}>{children}</LayoutDirectionContext.Provider>;
}

/** The layout direction of the active language; left to right outside a provider. */
export function useLayoutDirection(): LayoutDirectionValue {
  return useContext(LayoutDirectionContext);
}
