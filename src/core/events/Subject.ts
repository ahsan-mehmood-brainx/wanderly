export type Listener<T> = (value: T) => void;
export type Unsubscribe = () => void;

/** Read side of the Observer pattern: consumers can subscribe but not emit. */
export interface Observable<T> {
  subscribe(listener: Listener<T>): Unsubscribe;
}

/**
 * Minimal synchronous Observer implementation. Services own a Subject privately
 * and expose it as {@link Observable}, so only the owner can emit.
 *
 * - Every `subscribe` call is its own subscription (subscribing the same function twice notifies twice).
 * - A throwing listener is isolated: the rest are still notified and the error goes to `onListenerError`.
 * - Listeners added or removed during an emit take effect from the next emit.
 */
export class Subject<T> implements Observable<T> {
  private readonly subscriptions = new Set<{ readonly listener: Listener<T> }>();

  constructor(private readonly onListenerError: (error: unknown) => void = () => undefined) {}

  get listenerCount(): number {
    return this.subscriptions.size;
  }

  subscribe(listener: Listener<T>): Unsubscribe {
    const subscription = { listener };
    this.subscriptions.add(subscription);
    return () => {
      this.subscriptions.delete(subscription);
    };
  }

  emit(value: T): void {
    for (const { listener } of [...this.subscriptions]) {
      try {
        listener(value);
      } catch (error) {
        this.onListenerError(error);
      }
    }
  }

  clear(): void {
    this.subscriptions.clear();
  }
}
