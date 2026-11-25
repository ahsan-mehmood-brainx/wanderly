import { createAsyncThunk } from '@reduxjs/toolkit';
import { useDispatch, useSelector, useStore } from 'react-redux';

import { type AppDependencies } from '@/core/di/AppDependencies';

import { type AppDispatch, type AppStore, type RootState } from './store';

export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
/** For reading the latest state inside a callback, without re-rendering on every change. */
export const useAppStore = useStore.withTypes<AppStore>();

export const createAppAsyncThunk = createAsyncThunk.withTypes<{
  state: RootState;
  dispatch: AppDispatch;
  extra: AppDependencies;
}>();
