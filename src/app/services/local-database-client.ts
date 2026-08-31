export interface LocalResponse<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

export class LocalQueryBuilder<T = any> {
  private filters: Record<string, any> = {};
  private orderConfig: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private isSingle = false;
  private isMaybeSingle = false;
  private operation: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: any = null;
  private upsertConflict: string | undefined = undefined;

  constructor(
    private table: string,
    private getBaseUrl: () => string
  ) {}

  select(columns: string = '*'): this {
    this.operation = 'select';
    return this;
  }

  insert(data: any): this {
    this.operation = 'insert';
    this.payload = data;
    return this;
  }

  upsert(data: any, options?: { onConflict?: string }): this {
    this.operation = 'upsert';
    this.payload = data;
    this.upsertConflict = options?.onConflict;
    return this;
  }

  update(data: any): this {
    this.operation = 'update';
    this.payload = data;
    return this;
  }

  delete(): this {
    this.operation = 'delete';
    return this;
  }

  eq(column: string, value: any): this {
    this.filters[column] = `eq.${value}`;
    return this;
  }

  neq(column: string, value: any): this {
    this.filters[column] = `neq.${value}`;
    return this;
  }

  ilike(column: string, pattern: string): this {
    this.filters[column] = `ilike.${pattern}`;
    return this;
  }

  gte(column: string, value: any): this {
    this.filters[column] = `gte.${value}`;
    return this;
  }

  lte(column: string, value: any): this {
    this.filters[column] = `lte.${value}`;
    return this;
  }

  in(column: string, values: any[]): this {
    this.filters[column] = `in.(${values.join(',')})`;
    return this;
  }

  order(column: string, { ascending = true }: { ascending?: boolean } = {}): this {
    this.orderConfig = { column, ascending };
    return this;
  }

  limit(count: number): this {
    this.limitCount = count;
    return this;
  }

  single(): Promise<LocalResponse<T>> {
    this.isSingle = true;
    return this.execute();
  }

  maybeSingle(): Promise<LocalResponse<T>> {
    this.isMaybeSingle = true;
    return this.execute();
  }

  then<TResult1 = LocalResponse<T>, TResult2 = never>(
    onfulfilled?: ((value: LocalResponse<T>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute(): Promise<LocalResponse<T>> {
    try {
      const baseUrl = this.getBaseUrl();
      const url = new URL(`${baseUrl}/api/data/${this.table}`);

      // Append filter parameters
      for (const [k, v] of Object.entries(this.filters)) {
        url.searchParams.append(k, String(v));
      }
      if (this.orderConfig) {
        url.searchParams.append('order', `${this.orderConfig.column}.${this.orderConfig.ascending ? 'asc' : 'desc'}`);
      }
      if (this.limitCount !== null) {
        url.searchParams.append('limit', String(this.limitCount));
      }

      let response: Response;

      if (this.operation === 'select') {
        response = await fetch(url.toString(), {
          headers: { 'Accept': 'application/json' }
        });
      } else if (this.operation === 'insert') {
        response = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isUpsert: false, data: this.payload })
        });
      } else if (this.operation === 'upsert') {
        response = await fetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isUpsert: true, onConflict: this.upsertConflict, data: this.payload })
        });
      } else if (this.operation === 'update') {
        response = await fetch(url.toString(), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.payload)
        });
      } else if (this.operation === 'delete') {
        response = await fetch(url.toString(), {
          method: 'DELETE'
        });
      } else {
        throw new Error(`Unsupported operation: ${this.operation}`);
      }

      if (!response.ok) {
        const errorText = await response.text();
        return { data: null, error: { message: errorText, code: String(response.status) } };
      }

      let resData = await response.json();

      if (this.isSingle) {
        if (Array.isArray(resData)) {
          if (resData.length === 0) {
            return { data: null, error: { message: 'Row not found', code: 'PGRST116' } };
          }
          resData = resData[0];
        }
      } else if (this.isMaybeSingle) {
        if (Array.isArray(resData)) {
          resData = resData.length > 0 ? resData[0] : null;
        }
      }

      return { data: resData, error: null };
    } catch (err: any) {
      console.warn(`[LocalQueryBuilder] Execution failed on table ${this.table}:`, err);
      return { data: null, error: { message: err?.message || 'Network/Server Error' } };
    }
  }
}

export class LocalChannel {
  private callbacks: Array<{ event: string; callback: (payload: any) => void }> = [];

  constructor(
    private channelName: string,
    private wsManager: LocalWebSocketManager
  ) {}

  on(eventType: string, filter: any, callback: (payload: any) => void): this {
    this.callbacks.push({ event: eventType, callback });
    this.wsManager.registerListener(this.channelName, filter?.table, (msg) => {
      callback({
        eventType: msg.event,
        new: msg.record || {},
        old: msg.oldRecord || {}
      });
    });
    return this;
  }

  subscribe(callback?: (status: string) => void): this {
    if (callback) callback('SUBSCRIBED');
    return this;
  }

  unsubscribe(): void {
    this.wsManager.unregisterChannel(this.channelName);
  }
}

export class LocalWebSocketManager {
  private ws: WebSocket | null = null;
  private listeners: Map<string, Array<{ table?: string; callback: (data: any) => void }>> = new Map();
  private reconnectTimeout: any = null;

  constructor(private getWsUrl: () => string) {
    this.connect();
  }

  connect() {
    if (typeof window === 'undefined') return;
    try {
      const url = this.getWsUrl();
      this.ws = new WebSocket(url);

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'broadcast') {
            for (const [, list] of this.listeners) {
              for (const listener of list) {
                if (!listener.table || listener.table === data.table) {
                  listener.callback(data);
                }
              }
            }
          }
        } catch {
          // ignore non-json messages
        }
      };

      this.ws.onclose = () => {
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => this.connect(), 3000);
      };

      this.ws.onerror = () => {
        if (this.ws) this.ws.close();
      };
    } catch (e) {
      console.warn('[LocalWS] Could not connect to WebSocket:', e);
    }
  }

  registerListener(channelName: string, table: string | undefined, callback: (data: any) => void) {
    if (!this.listeners.has(channelName)) {
      this.listeners.set(channelName, []);
    }
    this.listeners.get(channelName)!.push({ table, callback });
  }

  unregisterChannel(channelName: string) {
    this.listeners.delete(channelName);
  }
}

export class LocalAuthClient {
  private authStateListeners: Array<(event: string, session: any) => void> = [];
  private currentSession: any = null;

  constructor(private getBaseUrl: () => string) {
    const saved = localStorage.getItem('promedical_local_session');
    if (saved) {
      try {
        this.currentSession = JSON.parse(saved);
      } catch {
        this.currentSession = null;
      }
    }
  }

  async signInWithPassword({ email, password }: { email: string; password?: string }): Promise<LocalResponse<any>> {
    try {
      const baseUrl = this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        return { data: null, error: { message: data.error || 'Error al iniciar sesión' } };
      }
      this.currentSession = data.session;
      localStorage.setItem('promedical_local_session', JSON.stringify(data.session));
      this.notifyAuthStateChange('SIGNED_IN', data.session);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'Error de conexión LAN' } };
    }
  }

  async signUp({ email, password, options }: { email: string; password?: string; options?: any }): Promise<LocalResponse<any>> {
    try {
      const baseUrl = this.getBaseUrl();
      const res = await fetch(`${baseUrl}/api/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, data: options?.data })
      });
      const data = await res.json();
      if (!res.ok) {
        return { data: null, error: { message: data.error || 'Error al registrar' } };
      }
      this.currentSession = data.session;
      localStorage.setItem('promedical_local_session', JSON.stringify(data.session));
      this.notifyAuthStateChange('SIGNED_IN', data.session);
      return { data, error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || 'Error de conexión LAN' } };
    }
  }

  async signOut(): Promise<LocalResponse<null>> {
    this.currentSession = null;
    localStorage.removeItem('promedical_local_session');
    this.notifyAuthStateChange('SIGNED_OUT', null);
    return { data: null, error: null };
  }

  async getSession(): Promise<{ data: { session: any }; error: null }> {
    if (!this.currentSession) {
      // Default session for seamless offline use if not explicitly signed in
      const defaultUser = {
        id: 'local-doc-1',
        email: 'doctor@promedical.local',
        user_metadata: {
          nombre: 'Dr. Thevenin',
          rol: 'doctor',
          especialidad: 'Urólogo'
        }
      };
      this.currentSession = {
        access_token: 'local-token',
        user: defaultUser
      };
      localStorage.setItem('promedical_local_session', JSON.stringify(this.currentSession));
    }
    return { data: { session: this.currentSession }, error: null };
  }

  async getUser(): Promise<{ data: { user: any }; error: null }> {
    const session = (await this.getSession()).data.session;
    return { data: { user: session?.user || null }, error: null };
  }

  onAuthStateChange(callback: (event: string, session: any) => void): { data: { subscription: { unsubscribe: () => void } } } {
    this.authStateListeners.push(callback);
    // Initial emit
    setTimeout(async () => {
      const sess = (await this.getSession()).data.session;
      callback('INITIAL_SESSION', sess);
    }, 0);

    return {
      data: {
        subscription: {
          unsubscribe: () => {
            this.authStateListeners = this.authStateListeners.filter(cb => cb !== callback);
          }
        }
      }
    };
  }

  private notifyAuthStateChange(event: string, session: any) {
    for (const listener of this.authStateListeners) {
      listener(event, session);
    }
  }
}

export class LocalDatabaseClient {
  public auth: LocalAuthClient;
  private wsManager: LocalWebSocketManager;

  constructor() {
    this.auth = new LocalAuthClient(() => this.getServerUrl());
    this.wsManager = new LocalWebSocketManager(() => this.getWsUrl());
  }

  getServerUrl(): string {
    if (typeof window !== 'undefined') {
      const savedHost = localStorage.getItem('promedical_lan_server_host') || 'localhost';
      const savedPort = localStorage.getItem('promedical_lan_server_port') || '3000';
      return `http://${savedHost}:${savedPort}`;
    }
    return 'http://localhost:3000';
  }

  getWsUrl(): string {
    if (typeof window !== 'undefined') {
      const savedHost = localStorage.getItem('promedical_lan_server_host') || 'localhost';
      const savedPort = localStorage.getItem('promedical_lan_server_port') || '3000';
      return `ws://${savedHost}:${savedPort}`;
    }
    return 'ws://localhost:3000';
  }

  from<T = any>(table: string): LocalQueryBuilder<T> {
    return new LocalQueryBuilder<T>(table, () => this.getServerUrl());
  }

  channel(channelName: string): LocalChannel {
    return new LocalChannel(channelName, this.wsManager);
  }

  removeChannel(channel: LocalChannel): void {
    channel.unsubscribe();
  }
}
