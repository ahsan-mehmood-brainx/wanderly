import { coalesce } from './coalesce';

const pending = (kind: 'upsert' | 'delete', isNew: boolean, status: 'pending' | 'inFlight' | 'failed' = 'pending') => ({
  kind,
  isNew,
  status,
});

describe('coalesce', () => {
  it.each([
    ['create', { action: 'write', kind: 'upsert', isNew: true }],
    ['update', { action: 'write', kind: 'upsert', isNew: false }],
    ['delete', { action: 'write', kind: 'delete', isNew: false }],
  ] as const)('starts an operation for a first %s', (change, expected) => {
    expect(coalesce(null, change)).toEqual(expected);
  });

  it('keeps a new entity new through later edits', () => {
    expect(coalesce(pending('upsert', true), 'update')).toEqual({ action: 'write', kind: 'upsert', isNew: true });
  });

  it('drops a new entity deleted before it was ever pushed', () => {
    expect(coalesce(pending('upsert', true), 'delete')).toEqual({ action: 'remove' });
    expect(coalesce(pending('upsert', true, 'failed'), 'delete')).toEqual({ action: 'remove' });
  });

  it('keeps the delete when the new entity is being pushed right now', () => {
    expect(coalesce(pending('upsert', true, 'inFlight'), 'delete')).toEqual({
      action: 'write',
      kind: 'delete',
      isNew: false,
    });
  });

  it('turns an update of a known entity into a delete', () => {
    expect(coalesce(pending('upsert', false), 'delete')).toEqual({ action: 'write', kind: 'delete', isNew: false });
  });

  it('turns a delete followed by a create into an upsert the remote may already know', () => {
    expect(coalesce(pending('delete', false), 'create')).toEqual({ action: 'write', kind: 'upsert', isNew: false });
  });
});
