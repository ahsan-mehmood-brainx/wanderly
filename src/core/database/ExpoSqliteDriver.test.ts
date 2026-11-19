import { openDatabaseAsync } from 'expo-sqlite';

import { expoSqliteDriver } from './ExpoSqliteDriver';

jest.mock('expo-sqlite', () => ({ openDatabaseAsync: jest.fn() }));

const db = {
  execAsync: jest.fn(async () => undefined),
  runAsync: jest.fn(async () => ({ changes: 2, lastInsertRowId: 9 })),
  getAllAsync: jest.fn(async () => [{ id: 1 }]),
  getFirstAsync: jest.fn(async () => ({ id: 1 })),
  closeAsync: jest.fn(async () => undefined),
};

describe('expoSqliteDriver', () => {
  beforeEach(() => jest.mocked(openDatabaseAsync).mockResolvedValue(db as never));

  it('opens its own connection in WAL mode', async () => {
    await expoSqliteDriver('app.db')();
    expect(openDatabaseAsync).toHaveBeenCalledWith('app.db', { useNewConnection: true });
    expect(db.execAsync).toHaveBeenCalledWith('PRAGMA journal_mode = WAL');
  });

  it('passes statements and bound values through', async () => {
    const connection = await expoSqliteDriver('app.db')();

    await expect(connection.run('UPDATE t SET a = ?', ['x'])).resolves.toEqual({ changes: 2 });
    expect(db.runAsync).toHaveBeenCalledWith('UPDATE t SET a = ?', ['x']);
    await expect(connection.getAll('SELECT 1', [1])).resolves.toEqual([{ id: 1 }]);
    await expect(connection.getFirst('SELECT 1')).resolves.toEqual({ id: 1 });
    expect(db.getFirstAsync).toHaveBeenCalledWith('SELECT 1', []);

    await connection.exec('COMMIT');
    expect(db.execAsync).toHaveBeenLastCalledWith('COMMIT');
    await connection.close();
    expect(db.closeAsync).toHaveBeenCalled();
  });
});
