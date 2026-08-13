import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

@Injectable({
    providedIn: 'root'
})
export class SupabaseService {
    private supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(
            environment.supabaseUrl,
            environment.supabaseKey,
            {
                auth: {
                    autoRefreshToken: true,
                    persistSession: true,
                    detectSessionInUrl: true,
                    flowType: 'pkce',
                    storageKey: 'promedical-auth-token',
                    // Bypass locks to prevent NavigatorLockAcquireTimeoutError during rapid HMR reloads in local dev
                    ...(!environment.production ? {
                        lock: async (name: string, acquireTimeout: number, fn: () => Promise<any>) => {
                            return await fn();
                        }
                    } : {})
                }
            }
        );
    }

    get client() {
        return this.supabase;
    }
}
