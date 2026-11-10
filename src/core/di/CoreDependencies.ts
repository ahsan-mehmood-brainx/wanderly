import { type AppConfig } from '@/core/config/appConfig';
import { type HttpClientFactory } from '@/core/http/HttpClientFactory';
import { type Logger } from '@/core/logging/Logger';
import { type ConnectivityService } from '@/core/network/ConnectivityService';
import { type KeyValueStore } from '@/core/storage/KeyValueStore';
import { type Clock } from '@/core/utils/Clock';
import { type IdGenerator } from '@/core/utils/IdGenerator';

/** Cross-cutting infrastructure every feature may depend on. All typed by interface. */
export interface CoreDependencies {
  readonly config: AppConfig;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly idGenerator: IdGenerator;
  readonly keyValueStore: KeyValueStore;
  readonly connectivity: ConnectivityService;
  readonly httpClientFactory: HttpClientFactory;
}
