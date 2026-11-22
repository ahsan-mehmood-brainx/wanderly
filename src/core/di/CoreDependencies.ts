import { type CacheStore } from '@/core/cache/CacheStore';
import { type AppConfig } from '@/core/config/appConfig';
import { type SqlDatabase } from '@/core/database/SqlDatabase';
import { type HttpClientFactory } from '@/core/http/HttpClientFactory';
import { type Logger } from '@/core/logging/Logger';
import { type ConnectivityService } from '@/core/network/ConnectivityService';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';
import { type SecureKeyValueStore } from '@/core/storage/SecureKeyValueStore';
import { type LocalChangeLog } from '@/core/sync/LocalChange';
import { type SyncOutbox } from '@/core/sync/SyncOutbox';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';

/** Cross-cutting infrastructure every feature may depend on. All typed by interface. */
export interface CoreDependencies {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  /** Plain storage for non-sensitive data (preferences, flags). */
  readonly keyValueStore: KeyValueStore;
  /** Encrypted storage for secrets such as auth tokens. */
  readonly secureStore: SecureKeyValueStore;
  /** On-device SQLite database for structured data (trips). */
  readonly database: SqlDatabase;
  /** Durable copies of remote data for offline use (`cache_entries`). Can be cleared at any time. */
  readonly cacheStore: CacheStore;
  /** Pending operations not yet pushed to a backend (`sync_outbox`), read by the sync engine. */
  readonly syncOutbox: SyncOutbox;
  /** Write side of the outbox: repositories record changes inside their transactions. */
  readonly localChangeLog: LocalChangeLog;
  readonly connectivity: ConnectivityService;
  readonly httpClientFactory: HttpClientFactory;
}
