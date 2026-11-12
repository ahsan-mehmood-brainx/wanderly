/**
 * Public surface of the HTTP layer. Feature code imports from `@/core/http` and
 * depends on `HttpClient` / `HttpClientFactory`; only the composition root and
 * this folder know axios exists (enforced by ESLint).
 */
export { ApiError, isApiError, kindForStatus, type ApiErrorDetails } from './ApiError';
export {
  BaseHttpClient,
  type ApiResponse,
  type ApiResult,
  type HttpClient,
  type HttpMethod,
  type QueryParams,
  type RequestConfig,
  type RequestOptions,
} from './HttpClient';
export { AxiosHttpClientFactory, type ApiDefinition, type HttpClientFactory } from './HttpClientFactory';
export {
  ApiKeyAuth,
  BearerTokenAuth,
  noAuth,
  type AuthCredentials,
  type AuthStrategy,
} from './strategies/AuthStrategy';
export {
  ExponentialBackoffRetry,
  IDEMPOTENT_METHODS,
  noRetry,
  type RetryContext,
  type RetryStrategy,
} from './strategies/RetryStrategy';
