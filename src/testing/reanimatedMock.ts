import { useState } from 'react';
import { FlatList, Image, ScrollView, Text, View } from 'react-native';

/**
 * Jest stand-in for `react-native-reanimated`. The library's own `mock` imports
 * its real entry point, which under jest-expo's native platform tries to install
 * native-only CSS handlers and throws. This covers what the app and Gesture
 * Handler use: shared values are plain objects, animations jump to their end
 * value and worklets run synchronously on the JS thread.
 */

const SHARED_VALUE = Symbol('sharedValue');
const NOOP = () => undefined;
const ID = <T>(value: T): T => value;

interface MockSharedValue<T> {
  value: T;
  get(): T;
  set(next: T | ((current: T) => T)): void;
  readonly [SHARED_VALUE]: true;
}

export function makeMutable<T>(initial: T): MockSharedValue<T> {
  const shared: MockSharedValue<T> = {
    value: initial,
    get: () => shared.value,
    set: (next) => {
      shared.value = typeof next === 'function' ? (next as (current: T) => T)(shared.value) : next;
    },
    [SHARED_VALUE]: true,
  };
  return shared;
}

export function useSharedValue<T>(initial: T): MockSharedValue<T> {
  const [shared] = useState(() => makeMutable(initial));
  return shared;
}

export const isSharedValue = (value: unknown): boolean =>
  typeof value === 'object' && value !== null && SHARED_VALUE in value;

export const useAnimatedStyle = <T>(updater: () => T): T => updater();
export const useAnimatedProps = <T>(updater: () => T): T => updater();
export const useDerivedValue = <T>(updater: () => T) => makeMutable(updater());
export const useAnimatedReaction = NOOP;
export const useEvent = () => NOOP;
export const useComposedEventHandler = () => NOOP;
export const useHandler = () => ({ context: {}, doDependenciesDiffer: false, useWeb: false });
export const useReducedMotion = () => false;

export const withTiming = <T>(toValue: T, _config?: unknown, callback?: (finished: boolean) => void): T => {
  callback?.(true);
  return toValue;
};
export const withSpring = withTiming;
export const cancelAnimation = NOOP;

export const runOnJS = ID;
export const runOnUI = ID;
export const setGestureState = NOOP;
export const createAnimatedComponent = ID;

export class NativeEventsManager {
  attachEvents = NOOP;
  detachEvents = NOOP;
  updateEvents = NOOP;
}

const Animated = { View, Text, Image, ScrollView, FlatList, createAnimatedComponent };
export default Animated;
