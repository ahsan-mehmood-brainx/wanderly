import { useCallback, useEffect, useRef, useState } from 'react';

import { useDependencies } from '@/core/di/DependenciesProvider';
import { type AppErrorKind } from '@/core/errors/AppError';
import { useConnectivity } from '@/shared/hooks/useConnectivity';

import { type SavedDataSummary } from '../../domain/savedData';
import { useSyncStatus } from './useSyncStatus';

export type SavedDataState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly summary: SavedDataSummary }
  | { readonly status: 'failed'; readonly errorKind: AppErrorKind };

/** View model for Offline and data: connection, pending changes and saved remote data. */
export function useOfflineData() {
  const { getSavedDataSummary, clearSavedData, syncEngine, clock } = useDependencies();
  const connectivity = useConnectivity();
  const sync = useSyncStatus();
  const [saved, setSaved] = useState<SavedDataState>({ status: 'loading' });
  const [clearing, setClearing] = useState(false);
  const [clearResult, setClearResult] = useState<'cleared' | AppErrorKind | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const loadSaved = useCallback(async () => {
    const result = await getSavedDataSummary.execute();
    if (!mounted.current) return;
    setSaved(
      result.ok ? { status: 'ready', summary: result.value } : { status: 'failed', errorKind: result.error.kind },
    );
  }, [getSavedDataSummary]);

  useEffect(() => {
    void loadSaved();
    // Counts may have changed since the engine last looked (changes made on other screens).
    void syncEngine.sync();
  }, [loadSaved, syncEngine]);

  const clearSaved = useCallback(async () => {
    setClearing(true);
    setClearResult(null);
    const result = await clearSavedData.execute();
    if (!mounted.current) return;
    setClearing(false);
    setClearResult(result.ok ? 'cleared' : result.error.kind);
    await loadSaved();
  }, [clearSavedData, loadSaved]);

  return {
    connectivity,
    sync,
    saved,
    now: clock.now(),
    clearing,
    clearResult,
    dismissClearResult: () => setClearResult(null),
    clearSaved: () => void clearSaved(),
    retrySaved: () => {
      setSaved({ status: 'loading' });
      void loadSaved();
    },
    retryFailedChanges: () => void syncEngine.retryFailed(),
    refreshChanges: () => void syncEngine.sync(),
  };
}
