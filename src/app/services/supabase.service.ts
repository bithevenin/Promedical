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
                    detectSessionInUrl: true,
                    flowType: 'pkce',
                    storageKey: 'promedical-auth-token'
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
                        if (cfg.mode) localStorage.setItem('promedical_lan_mode', cfg.mode);
                        if (cfg.serverHost) localStorage.setItem('promedical_lan_server_host', cfg.serverHost);
                        if (cfg.port) localStorage.setItem('promedical_lan_server_port', String(cfg.port));
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
            return {
                host: localStorage.getItem('promedical_lan_server_host') || 'localhost',
                port: localStorage.getItem('promedical_lan_server_port') || '3000',
                mode: localStorage.getItem('promedical_lan_mode') || 'server'
            };
        }
        return { host: 'localhost', port: '3000', mode: 'server' };
    }
}

