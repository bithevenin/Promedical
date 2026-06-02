import { Injectable } from '@angular/core';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

@Injectable({
  providedIn: 'root'
})
export class OfflineService {
  private dbName = 'promedical_offline';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  private supabase: SupabaseClient;
  private isSyncing = false;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
    this.initDatabase().then(() => {
      console.log('IndexedDB initialized.');
      this.checkAndSync();
    });

    window.addEventListener('online', () => {
      console.log('Network is back online. Triggering sync...');
      this.checkAndSync();
    });
  }

  private initDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;

        // Define all stores (tables) matching Supabase schemas
        if (!db.objectStoreNames.contains('citas')) {
          db.createObjectStore('citas', { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('pacientes')) {
          db.createObjectStore('pacientes', { keyPath: 'cedula' });
        }
        if (!db.objectStoreNames.contains('consultas')) {
          db.createObjectStore('consultas', { keyPath: 'id' }); // UUID/String
        }
        if (!db.objectStoreNames.contains('transacciones')) {
          db.createObjectStore('transacciones', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('facturas_seguro')) {
          db.createObjectStore('facturas_seguro', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('reportes_pagos_seguro')) {
          db.createObjectStore('reportes_pagos_seguro', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('configuracion_doctor')) {
          db.createObjectStore('configuracion_doctor', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('tarifas_seguro')) {
          db.createObjectStore('tarifas_seguro', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('signos_vitales')) {
          db.createObjectStore('signos_vitales', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('sync_queue')) {
          db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (event: any) => {
        this.db = event.target.result;
        resolve(event.target.result);
      };

      request.onerror = (event: any) => {
        reject(event.target.error);
      };
    });
  }

  // --- Core DB Actions ---

  async getLocalData(storeName: string): Promise<any[]> {
    if (!this.db) await this.initDatabase();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  }

  async saveLocalData(storeName: string, data: any): Promise<void> {
    if (!this.db) await this.initDatabase();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async deleteLocalData(storeName: string, key: any): Promise<void> {
    if (!this.db) await this.initDatabase();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async clearStore(storeName: string): Promise<void> {
    if (!this.db) await this.initDatabase();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  // --- Sync Queue Actions ---

  async addToQueue(table: string, action: 'insert' | 'update' | 'upsert' | 'delete', data: any, queryKey?: string, queryValue?: any): Promise<void> {
    const queueItem = {
      table,
      action,
      data,
      queryKey,
      queryValue,
      timestamp: Date.now()
    };
    await this.saveLocalData('sync_queue', queueItem);
    this.checkAndSync();
  }

  isOnline(): boolean {
    return navigator.onLine;
  }

  async checkAndSync(): Promise<void> {
    if (!this.isOnline() || this.isSyncing) return;
    this.isSyncing = true;

    try {
      const queue = await this.getLocalData('sync_queue');
      if (queue.length === 0) {
        this.isSyncing = false;
        return;
      }

      console.log(`Starting synchronization of ${queue.length} items...`);

      // Process items sequentially to maintain correct order of operations
      for (const item of queue) {
        try {
          let error = null;

          if (item.action === 'insert') {
            const { error: err } = await (this.supabase as any).from(item.table).insert([item.data]);
            error = err;
          } else if (item.action === 'update') {
            const { error: err } = await (this.supabase as any)
              .from(item.table)
              .update(item.data)
              .eq(item.queryKey, item.queryValue);
            error = err;
          } else if (item.action === 'upsert') {
            const { error: err } = await (this.supabase as any).from(item.table).upsert(item.data);
            error = err;
          } else if (item.action === 'delete') {
            const { error: err } = await (this.supabase as any)
              .from(item.table)
              .delete()
              .eq(item.queryKey, item.queryValue);
            error = err;
          }

          if (error) {
            console.error(`Error syncing item ${item.id} on table ${item.table}:`, error);
            // If it's a conflict or table error, we might skip it or wait.
            // For now, if it is a standard DB error, let's keep it in queue to retry or skip if it's invalid.
            if (error.code === '23505') { // Duplicate key, skip it
              await this.deleteLocalData('sync_queue', item.id);
            } else {
              // Network error? Stop sync loop and retry later
              this.isSyncing = false;
              return;
            }
          } else {
            console.log(`Item ${item.id} synced successfully to table ${item.table}`);
            await this.deleteLocalData('sync_queue', item.id);
          }
        } catch (err) {
          console.error(`Unexpected sync error for item ${item.id}:`, err);
          this.isSyncing = false;
          return;
        }
      }
    } catch (err) {
      console.error('Error during queue processing:', err);
    } finally {
      this.isSyncing = false;
    }
  }
}
