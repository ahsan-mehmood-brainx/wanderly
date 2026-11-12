import { deepLinkInbox } from '@/shared/navigation/deepLinks';

/**
 * Called by Expo Router (native only) with every incoming link before it navigates.
 * The path is recorded so it can be replayed if a guard redirects away from it
 * (session still restoring, or signed out). It is never rewritten, and this must never throw.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    deepLinkInbox.record(path);
  } catch {
    // Recording is best-effort; navigation must proceed regardless.
  }
  return path;
}
