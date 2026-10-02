import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { LocalDatabaseClient } from './local-database-client';

@Injectable({
    providedIn: 'root'
})
export class SupabaseService {
    private supabaseCloud: SupabaseClient;
    private localClient: LocalDatabaseClient;
    private useLocalMode = true;

    constructor() {
        // Inicializar cliente Supabase Cloud SIEMPRE para Autenticación (login, logout, sesiones)
        this.supabaseCloud = createClient(
            environment.supabaseUrl,
            environment.supabaseKey,
            {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: false,
                    flowType: 'pkce',
                    storageKey: 'promedical-auth-token',
                    lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => {
                        return await fn();
                    }
                }
            }
        );

        // Cliente local para datos (pacientes, citas, consultas en SQLite LAN), con Auth delegado a Supabase
        this.localClient = new LocalDatabaseClient(this.supabaseCloud.auth);

        // Modo de base de datos
        const savedMode = typeof localStorage !== 'undefined' ? localStorage.getItem('promedical_db_mode') : 'local';
        this.useLocalMode = savedMode !== 'cloud';

        // Sincronizar configuración de Electron si está disponible
        this.syncElectronConfig();
    }

    private async syncElectronConfig() {
        if (typeof window !== 'undefined') {
            const electronApi = (window as any).electronAPI;
            if (electronApi?.getConfig) {
                try {
                    const cfg = await electronApi.getConfig();
                    if (cfg) {
                        const oldHost = localStorage.getItem('promedical_lan_server_host');
                        const oldMode = localStorage.getItem('promedical_lan_mode');
                        const oldPort = localStorage.getItem('promedical_lan_server_port');

                        if (cfg.mode) localStorage.setItem('promedical_lan_mode', cfg.mode);

                        let host = cfg.serverHost;
                        if (cfg.mode === 'client' && (!host || host === 'localhost' || host === '127.0.0.1')) {
                            host = '192.168.0.101';
                        }
                        if (host) localStorage.setItem('promedical_lan_server_host', host);
                        if (cfg.port) localStorage.setItem('promedical_lan_server_port', String(cfg.port));

                        if (host !== oldHost || cfg.mode !== oldMode || String(cfg.port) !== oldPort) {
                            this.localClient.reconnect();
                        }
                    }
                } catch (e) {
                    console.warn('[SupabaseService] Error syncing config from Electron:', e);
                }
            }
        }
    }

    get client(): any {
        if (this.useLocalMode) {
            return this.localClient;
        }
        return this.supabaseCloud;
    }

    get cloudClient(): SupabaseClient {
        return this.supabaseCloud;
    }

    get isLocal(): boolean {
        return this.useLocalMode;
    }

    setMode(mode: 'local' | 'cloud') {
        this.useLocalMode = (mode === 'local');
        if (typeof localStorage !== 'undefined') {
            localStorage.setItem('promedical_db_mode', mode);
        }
    }

    setLanServer(host: string, port: number = 3000, mode?: 'server' | 'client') {
        if (typeof localStorage !== 'undefined') {
            if (mode) {
                localStorage.setItem('promedical_lan_mode', mode);
            }
            localStorage.setItem('promedical_lan_server_host', host);
            localStorage.setItem('promedical_lan_server_port', String(port));
        }
        if (this.localClient) {
            this.localClient.reconnect();
        }
    }

    reconnectLan() {
        if (this.localClient) {
            this.localClient.reconnect();
        }
    }

    async broadcastReload() {
        if (this.localClient) {
            await this.localClient.broadcastReload();
        }
    }

    getLanServer(): { host: string; port: string; mode: string } {
        if (typeof localStorage !== 'undefined') {
            const mode = localStorage.getItem('promedical_lan_mode') || 'server';
            let host = localStorage.getItem('promedical_lan_server_host');
            if (mode === 'client' && (!host || host === 'localhost' || host === '127.0.0.1')) {
                host = '192.168.0.101';
            }
            return {
                host: host || (mode === 'server' ? 'localhost' : '192.168.0.101'),
                port: localStorage.getItem('promedical_lan_server_port') || '3000',
                mode
            };
        }
        return { host: 'localhost', port: '3000', mode: 'server' };
    }
}

