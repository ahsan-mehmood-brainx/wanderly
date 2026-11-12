/** What a request needs to be authorised: extra headers and/or query parameters. */
export interface AuthCredentials {
  readonly headers?: Readonly<Record<string, string>>;
  readonly query?: Readonly<Record<string, string>>;
}

/**
 * Strategy for authorising requests to one API. Public travel APIs disagree on
 * how keys are sent (header vs query string vs bearer token), so each API picks
 * a strategy in its definition and the HTTP stack applies it uniformly.
 * Strategies never see axios, so they are trivially unit-testable.
 */
export interface AuthStrategy {
  getCredentials(): AuthCredentials | Promise<AuthCredentials>;
}

export const noAuth: AuthStrategy = { getCredentials: () => ({}) };

export interface ApiKeyAuthOptions {
  /** Header or query parameter name, e.g. `X-Api-Key` or `apikey`. */
  readonly name: string;
  readonly value: string;
  readonly location: 'header' | 'query';
}

/**
 * Static API key. Keys shipped in an app bundle are public: only use keys the
 * provider intends for client apps, and restrict them (bundle id, referrer, quota).
 */
export class ApiKeyAuth implements AuthStrategy {
  constructor(private readonly options: ApiKeyAuthOptions) {}

  getCredentials(): AuthCredentials {
    const { name, value, location } = this.options;
    return location === 'header' ? { headers: { [name]: value } } : { query: { [name]: value } };
  }
}

/** Token read on every request, so refreshed tokens are picked up without rebuilding the client. */
export class BearerTokenAuth implements AuthStrategy {
  constructor(private readonly getToken: () => string | null | Promise<string | null>) {}

  async getCredentials(): Promise<AuthCredentials> {
    const token = await this.getToken();
    return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
  }
}
