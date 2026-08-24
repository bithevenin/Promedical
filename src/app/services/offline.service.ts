import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

interface QueueItem {
  id: number;
  table: string;
  action: 'insert' | 'update' | 'upsert' | 'delete';
  data: any;
  queryKey?: string;
  queryValue?: string | number;
  timestamp: number;
}

@Injectable({
  providedIn: 'root'
})
export class OfflineService {
  private dbName = 'promedical_offline';
  private dbVersion = 1;
  private db: IDBDatabase | null = null;
  private supabase: SupabaseClient;
  private isSyncing = false;

  /** true = Supabase es alcanzable, false = conexión cortada o bloqueada */
  private supabaseReachableSubject = new BehaviorSubject<boolean>(true);
  supabaseReachable$ = this.supabaseReachableSubject.asObservable();

  /** Emite el nombre de la entidad que se guardó en modo offline (para disparar el modal) */
  private offlineSaveSubject = new Subject<string>();
  offlineSave$ = this.offlineSaveSubject.asObservable();

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.client;
    this.initDatabase().then(() => {
      this.checkAndSync();
    });

    window.addEventListener('online', () => {
      this.updateReachability();
      this.checkAndSync();
    });
    window.addEventListener('offline', () => {
      this.supabaseReachableSubject.next(false);
    });

    // Sondear cada 15s para detectar cables bloqueados (falsos positivos de navigator.onLine)
    setInterval(() => this.updateReachability(), 15000);
  }

  private initDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;

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

      request.onsuccess = (event: Event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve((event.target as IDBOpenDBRequest).result);
      };

      request.onerror = (event: Event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  // --- Core DB Actions ---

  async getLocalData<T = Record<string, unknown>>(storeName: string): Promise<T[]> {
    if (!this.db) await this.initDatabase();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onsuccess = () => resolve((request.result || []) as T[]);
      request.onerror = () => reject(request.error);
    });
  }

  async saveLocalData<T = Record<string, unknown>>(storeName: string, data: T): Promise<void> {
    if (!this.db) await this.initDatabase();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(data);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  async saveLocalDataBulk<T = Record<string, unknown>>(storeName: string, dataArray: T[]): Promise<void> {
    if (!this.db) await this.initDatabase();
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);

      for (const item of dataArray) {
        store.put(item);
      }
    });
  }

  async deleteLocalData(storeName: string, key: string | number): Promise<void> {
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

  async addToQueue<T = Record<string, unknown>>(table: string, action: 'insert' | 'update' | 'upsert' | 'delete', data: T | null, queryKey?: string, queryValue?: string | number): Promise<void> {
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

  /**
   * Verifica si hay conexión de red disponible a nivel de hardware.
   */
  isOnline(): boolean {
    return navigator.onLine;
  }

  /**
   * Verifica conectividad REAL con Supabase (previene falsos positivos del cable).
   * Hace un GET a la tabla pacientes para obtener status 200 (sin errores en consola).
   */
  async isOnlineAndReachable(): Promise<boolean> {
    if (!navigator.onLine) {
      this.supabaseReachableSubject.next(false);
      return false;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3500);
      const url = `${environment.supabaseUrl}/rest/v1/pacientes?select=cedula&limit=1`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'apikey': environment.supabaseKey,
          'Authorization': `Bearer ${environment.supabaseKey}`
        },
        signal: controller.signal,
        cache: 'no-store'
      });
      clearTimeout(timeout);
      const reachable = response.ok;
      this.supabaseReachableSubject.next(reachable);
      return reachable;
    } catch {
      this.supabaseReachableSubject.next(false);
      return false;
    }
  }

  /** Llama a isOnlineAndReachable y actualiza el indicador de estado (sin retornar nada). */
  async updateReachability(): Promise<void> {
    await this.isOnlineAndReachable();
  }

  /**
   * Notifica a la UI que un dato se guardó en modo offline.
   * @param entityName Nombre de la entidad guardada (ej: 'paciente', 'cita')
   */
  notifyOfflineSave(entityName: string): void {
    this.offlineSaveSubject.next(entityName);
  }

  async checkAndSync(): Promise<void> {
    if (!(await this.isOnlineAndReachable()) || this.isSyncing) return;
    this.isSyncing = true;

    try {
      const queue = await this.getLocalData<QueueItem>('sync_queue');
      if (queue.length === 0) {
        this.isSyncing = false;
        return;
      }

      // Process items sequentially to maintain correct order of operations
      for (const item of queue) {
        try {
          let error = null;

          if (item.action === 'insert') {
            const { error: err } = await this.supabase.from(item.table).insert([item.data]);
            error = err;
          } else if (item.action === 'update') {
            const { error: err } = await this.supabase
              .from(item.table)
              .update(item.data)
              .eq(item.queryKey as string, item.queryValue as string | number);
            error = err;
          } else if (item.action === 'upsert') {
            const { error: err } = await this.supabase.from(item.table).upsert(item.data);
            error = err;
          } else if (item.action === 'delete') {
            const { error: err } = await this.supabase
              .from(item.table)
              .delete()
              .eq(item.queryKey as string, item.queryValue as string | number);
            error = err;
          }

          if (error) {
            console.error(`Error syncing item ${item.id} on table ${item.table}:`, error);
            // If it's a conflict or table error, we might skip it or wait.
            // For now, if it is a standard DB error, let's keep it in queue to retry or skip if it's invalid.
            if (error.code === '23505' || (error.code && String(error.code).startsWith('PGRST'))) { // Duplicate key or API/Schema error, skip it
              console.warn(`Discarding unrecoverable sync item ${item.id} due to API/Schema error (${error.code}).`);
              await this.deleteLocalData('sync_queue', item.id);
            } else {
              // Network error? Stop sync loop and retry later
              this.isSyncing = false;
              return;
            }
          } else {
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
