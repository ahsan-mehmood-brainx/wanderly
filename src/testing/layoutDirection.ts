import { type screen } from '@testing-library/react-native';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

type Element = ReturnType<typeof screen.getByText>;

const STYLE_PROPS = ['style', 'contentContainerStyle'] as const;

/**
 * The layout direction that applies to `element`: the `direction` style of the
 * nearest ancestor (or the element itself) that sets one, `undefined` if none does.
 */
export function layoutDirectionAt(element: Element): ViewStyle['direction'] | undefined {
  for (let node: Element | null = element; node; node = node.parent) {
    for (const prop of STYLE_PROPS) {
      const style = StyleSheet.flatten(node.props[prop] as StyleProp<ViewStyle>);
      if (style?.direction) return style.direction;
    }
  }
  return undefined;
}
