import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { LocalDatabaseClient } from './local-database-client';

@Injectable({
    providedIn: 'root'
})
export class SupabaseService {
    private supabaseCloud: SupabaseClient | null = null;
    private localClient: LocalDatabaseClient;
    private useLocalMode = true; // Forzado a true para operar 100% en local y no tocar la nube

    constructor() {
        this.localClient = new LocalDatabaseClient();

        // Modo configurable desde localStorage si en el futuro se desea cambiar
        const savedMode = typeof localStorage !== 'undefined' ? localStorage.getItem('promedical_db_mode') : 'local';
        this.useLocalMode = savedMode !== 'cloud';

        if (!this.useLocalMode) {
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
        }
    }

    get client(): any {
        if (this.useLocalMode) {
            return this.localClient;
        }
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

    setLanServer(host: string, port: number = 3000) {
        if (typeof localStorage !== 'undefined') {
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

    getLanServer(): { host: string; port: string } {
        if (typeof localStorage !== 'undefined') {
            return {
                host: localStorage.getItem('promedical_lan_server_host') || 'localhost',
                port: localStorage.getItem('promedical_lan_server_port') || '3000'
            };
        }
        return { host: 'localhost', port: '3000' };
    }
}
