import { Subject } from './Subject';

describe('Subject', () => {
  it('notifies every subscriber in subscription order', () => {
    const subject = new Subject<number>();
    const calls: string[] = [];
    subject.subscribe((value) => calls.push(`a${value}`));
    subject.subscribe((value) => calls.push(`b${value}`));

    subject.emit(1);

    expect(calls).toEqual(['a1', 'b1']);
  });

  it('stops notifying after unsubscribe', () => {
    const subject = new Subject<number>();
    const listener = jest.fn();
    const unsubscribe = subject.subscribe(listener);

    unsubscribe();
    subject.emit(1);

    expect(listener).not.toHaveBeenCalled();
    expect(subject.listenerCount).toBe(0);
  });

  it('treats each subscribe call as its own subscription', () => {
    const subject = new Subject<number>();
    const listener = jest.fn();
    const first = subject.subscribe(listener);
    subject.subscribe(listener);

    first();
    subject.emit(1);

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('isolates a throwing listener from the others', () => {
    const onListenerError = jest.fn();
    const subject = new Subject<number>(onListenerError);
    const healthy = jest.fn();
    subject.subscribe(() => {
      throw new Error('boom');
    });
    subject.subscribe(healthy);

    subject.emit(1);

    expect(healthy).toHaveBeenCalledWith(1);
    expect(onListenerError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('applies subscriptions made during an emit from the next emit', () => {
    const subject = new Subject<number>();
    const late = jest.fn();
    subject.subscribe(() => subject.subscribe(late));

    subject.emit(1);
    expect(late).not.toHaveBeenCalled();

    subject.emit(2);
    expect(late).toHaveBeenCalledWith(2);
  });
});
