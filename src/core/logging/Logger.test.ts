import { ManualClock } from '@/testing/ManualClock';

import { AppLogger, ConsoleTransport, type LogRecord, type LogTransport } from './Logger';

function setup(minLevel?: 'debug' | 'info' | 'warn' | 'error') {
  const records: LogRecord[] = [];
  const transport: LogTransport = { write: (record) => records.push(record) };
  const logger = new AppLogger({ transports: [transport], minLevel, clock: new ManualClock(42) });
  return { logger, records };
}

describe('AppLogger', () => {
  it('sends structured records to every transport', () => {
    const { logger, records } = setup();
    const error = new Error('boom');

    logger.error('Failed', error, { id: 1 });

    expect(records).toEqual([{ level: 'error', message: 'Failed', timestamp: 42, context: { id: 1 }, error }]);
  });

  it('drops records below the minimum level', () => {
    const { logger, records } = setup('warn');

    logger.debug('d');
    logger.info('i');
    logger.warn('w');

    expect(records.map((record) => record.level)).toEqual(['warn']);
  });

  it('redacts sensitive context before any transport sees it', () => {
    const { logger, records } = setup();
    logger.info('Request', { apiKey: 'secret', path: '/x' });
    expect(records[0]?.context).toEqual({ apiKey: '[REDACTED]', path: '/x' });
  });

  it('child loggers add their context and keep the parent level', () => {
    const { logger, records } = setup('info');
    const child = logger.child({ scope: 'http' }).child({ api: 'weather' });

    child.debug('hidden');
    child.info('shown', { status: 200 });

    expect(records).toHaveLength(1);
    expect(records[0]?.context).toEqual({ scope: 'http', api: 'weather', status: 200 });
  });

  it('keeps logging when a transport throws', () => {
    const records: LogRecord[] = [];
    const logger = new AppLogger({
      transports: [
        {
          write: () => {
            throw new Error('transport down');
          },
        },
        { write: (record) => records.push(record) },
      ],
    });

    expect(() => logger.warn('still works')).not.toThrow();
    expect(records).toHaveLength(1);
  });
});

describe('ConsoleTransport', () => {
  it('writes to the matching console method with a prefix', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    new ConsoleTransport().write({ level: 'warn', message: 'Careful', timestamp: 0, context: { id: 1 } });
    expect(warn).toHaveBeenCalledWith('[Wanderly] Careful', { id: 1 });
    warn.mockRestore();
  });
});
