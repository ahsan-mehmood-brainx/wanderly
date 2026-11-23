import { render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { LayoutDirectionProvider, useLayoutDirection } from './LayoutDirectionProvider';

function DirectionProbe() {
  const { direction, isRTL } = useLayoutDirection();
  return <Text testID="direction">{`${direction}:${String(isRTL)}`}</Text>;
}

describe('useLayoutDirection', () => {
  it('TC-03 is right to left for Urdu', async () => {
    await render(
      <LayoutDirectionProvider language="ur">
        <DirectionProbe />
      </LayoutDirectionProvider>,
    );

    expect(screen.getByTestId('direction')).toHaveTextContent('rtl:true');
  });

  it.each(['en', 'es'] as const)('TC-03 is left to right for %s', async (language) => {
    await render(
      <LayoutDirectionProvider language={language}>
        <DirectionProbe />
      </LayoutDirectionProvider>,
    );

    expect(screen.getByTestId('direction')).toHaveTextContent('ltr:false');
  });

  it('TC-03 follows a language change', async () => {
    const { rerender } = await render(
      <LayoutDirectionProvider language="en">
        <DirectionProbe />
      </LayoutDirectionProvider>,
    );

    await rerender(
      <LayoutDirectionProvider language="ur">
        <DirectionProbe />
      </LayoutDirectionProvider>,
    );

    expect(screen.getByTestId('direction')).toHaveTextContent('rtl:true');
  });

  it('TC-03 defaults to left to right outside a provider', async () => {
    await render(<DirectionProbe />);

    expect(screen.getByTestId('direction')).toHaveTextContent('ltr:false');
  });
});
