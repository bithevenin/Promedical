import { Injectable } from '@angular/core';
import { SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { environment } from 'src/environments/environment';
import { BehaviorSubject } from 'rxjs';
import { UserProfile } from '../models';

const OFFLINE_SESSION_KEY = 'promedical_offline_session';
const OFFLINE_PROFILE_KEY = 'promedical_offline_profile';
const OFFLINE_CRED_HASH_KEY = 'promedical_offline_cred_hash';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private userSession = new BehaviorSubject<Session | null>(null);
  private userProfile = new BehaviorSubject<UserProfile | null>(null);
  private isExplicitSignOut = false;

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.cloudClient;

    // 1. Inmediatamente hidratar sesión y perfil desde el almacenamiento local si existe
    this.restoreOfflineSessionIfAvailable();

    // 2. Escuchar cambios de autenticación de Supabase
    this.supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      console.log('[AuthService] onAuthStateChange event:', event, 'hasSession:', !!session);

      if (session?.user) {
        this.userSession.next(session);
        this.saveOfflineSession(session);
        await this.loadProfile(session.user.id);
      } else {
        // Si el evento reporta sesión nula pero el usuario NO hizo un "Cerrar sesión" explícito
        // (por ejemplo: token expirado mientras no hay internet, microcorte de red o caída de Supabase),
        // PRESERVAR la sesión offline activa para garantizar operatividad médica ininterrumpida.
        if (this.isExplicitSignOut) {
          this.userSession.next(null);
          this.userProfile.next(null);
          this.clearOfflineSession();
        } else {
          const offlineSession = this.getOfflineSession();
          if (offlineSession?.user) {
            console.warn('[AuthService] Supabase reportó sesión inactiva/nula, pero se preserva sesión offline por contingencia.');
            this.userSession.next(offlineSession);
            const offlineProfile = this.getOfflineProfile();
            if (offlineProfile) {
              this.userProfile.next(offlineProfile);
            }
          } else {
            this.userSession.next(null);
            this.userProfile.next(null);
          }
        }
      }
    });
  }

  private restoreOfflineSessionIfAvailable() {
    try {
      const offlineSession = this.getOfflineSession();
      const offlineProfile = this.getOfflineProfile();
      if (offlineSession?.user) {
        this.userSession.next(offlineSession);
      }
      if (offlineProfile) {
        this.userProfile.next(offlineProfile);
      }
    } catch (e) {
      console.warn('[AuthService] Error restaurando sesión offline:', e);
    }
  }

  async isSessionActive(): Promise<boolean> {
    // 1. Si ya tenemos una sesión y perfil en memoria activos, validar inmediatamente
    if (this.userSession.value?.user && this.userProfile.value) {
      return true;
    }

    // 2. Intentar validar con Supabase Cloud si hay conexión
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) {
        this.userSession.next(session);
        this.saveOfflineSession(session);
        if (!this.userProfile.value) {
          await this.loadProfile(session.user.id);
        }
        return true;
      }
    } catch (e) {
      console.warn('[AuthService] Error verificando sesión en la nube (sin internet o fallo de red):', e);
    }

    // 3. Fallback de contingencia médica / Modo Catástrofe (Sin Internet):
    // Si el médico ya tenía una sesión previa en esta máquina, NO expulsarlo bajo ninguna circunstancia.
    const offlineSession = this.getOfflineSession();
    if (offlineSession?.user) {
      console.log('[AuthService] Activando sesión de contingencia offline para:', offlineSession.user.email);
      this.userSession.next(offlineSession);
      let offlineProfile = this.getOfflineProfile();
      if (!offlineProfile) {
        offlineProfile = {
          id: offlineSession.user.id,
          nombre: offlineSession.user.user_metadata?.nombre || offlineSession.user.email?.split('@')[0] || 'Doctor',
          correo: offlineSession.user.email || '',
          foto_url: offlineSession.user.user_metadata?.foto_url || '',
          rol: offlineSession.user.user_metadata?.rol || 'doctor',
          especialidad: offlineSession.user.user_metadata?.especialidad || 'Médico'
        };
        this.saveOfflineProfile(offlineProfile);
      }
      this.userProfile.next(offlineProfile);
      return true;
    }

    return false;
  }

  get user$() {
    return this.userSession.asObservable();
  }

  get currentUser() {
    return this.userSession.value;
  }

  get profile$() {
    return this.userProfile.asObservable();
  }

  get currentProfile() {
    return this.userProfile.value;
  }

  hasRole(allowedRoles: string[]): boolean {
    const profile = this.currentProfile;
    if (!profile) return false;
    return allowedRoles.includes(profile.rol);
  }

  async loadProfile(uid: string) {
    let profileData: any = null;

    try {
      // 1. Intentar buscar en Supabase Cloud si hay internet
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      const session = this.userSession.value;
      const userEmail = session?.user?.email;

      if (data && !error) {
        profileData = data;
      } else if (userEmail) {
        const { data: dataByEmail } = await this.supabase
          .from('usuarios')
          .select('*')
          .ilike('correo', userEmail)
          .maybeSingle();

        if (dataByEmail) {
          profileData = { ...dataByEmail, id: uid };
          try {
            await this.supabase
              .from('usuarios')
              .update({ id: uid })
              .ilike('correo', userEmail);
          } catch {}
        }
      }
    } catch (cloudErr) {
      console.warn('[AuthService] No se pudo conectar con Supabase para cargar perfil (modo offline activo):', cloudErr);
    }

    // 2. Si falló la nube, buscar en la base de datos local SQLite (LAN)
    if (!profileData) {
      try {
        const localClient = this.supabaseService.client;
        const { data: localUser } = await localClient
          .from('usuarios')
          .select('*')
          .eq('id', uid)
          .maybeSingle();

        if (localUser) {
          profileData = localUser;
        } else {
          const session = this.userSession.value;
          const userEmail = session?.user?.email;
          if (userEmail) {
            const { data: localByEmail } = await localClient
              .from('usuarios')
              .select('*')
              .ilike('correo', userEmail)
              .maybeSingle();
            if (localByEmail) profileData = localByEmail;
          }
        }
      } catch (localErr) {
        console.warn('[AuthService] Error consultando perfil en SQLite local:', localErr);
      }
    }

    // 3. Si aún no tenemos perfil, recuperar el cacheado en almacenamiento local
    if (!profileData) {
      profileData = this.getOfflineProfile();
    }

    // 4. Si es una contingencia sin perfil previo, armar perfil por defecto
    if (!profileData && this.userSession.value?.user) {
      const session = this.userSession.value;
      const meta = session.user.user_metadata || {};
      const userEmail = session.user.email || '';
      profileData = {
        id: uid,
        nombre: meta['nombre'] || userEmail.split('@')[0] || 'Doctor',
        correo: userEmail,
        foto_url: meta['foto_url'] || '',
        rol: meta['rol'] || 'doctor',
        especialidad: meta['especialidad'] || 'Medicina General'
      };
    }

    if (profileData) {
      this.userProfile.next(profileData);
      this.saveOfflineProfile(profileData);
      this.syncUserToLocalDb(profileData);
    }
  }

  private async syncUserToLocalDb(profile: any, password?: string) {
    try {
      const localClient = this.supabaseService.client;
      const userToUpsert: any = {
        id: profile.id,
        correo: profile.correo,
        nombre: profile.nombre,
        rol: profile.rol || 'doctor',
        especialidad: profile.especialidad || '',
        foto_url: profile.foto_url || ''
      };
      if (password) {
        userToUpsert.password_hash = password;
      }
      await localClient.from('usuarios').upsert(userToUpsert);
    } catch (e) {
      // Ignorar errores silenciosos de sincronización local
    }
  }

  async getAllUsers() {
    const userMap = new Map<string, any>();

    // 1. Intentar consultar en Supabase Cloud si hay conexión
    try {
      const { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        for (const u of data) {
          const key = (u.correo || u.id || '').toLowerCase();
          if (key) userMap.set(key, u);
        }
      }
    } catch (e) {
      console.warn('[AuthService] Error obteniendo usuarios de la nube:', e);
    }

    // 2. Consultar en SQLite local LAN para incluir usuarios locales u offline
    try {
      const localClient = this.supabaseService.client;
      const { data: localData } = await localClient
        .from('usuarios')
        .select('*')
        .order('nombre', { ascending: true });

      if (Array.isArray(localData)) {
        for (const u of localData) {
          const key = (u.correo || u.id || '').toLowerCase();
          if (key && !userMap.has(key)) {
            userMap.set(key, u);
          }
        }
      }
    } catch (e) {
      console.warn('[AuthService] Error obteniendo usuarios locales:', e);
    }

    return Array.from(userMap.values());
  }

  async updateUser(id: string, nombre: string, fotoUrl: string, rol: string, especialidad?: string) {
    const updateData: Record<string, string> = { nombre, foto_url: fotoUrl, rol };
    if (especialidad !== undefined) updateData['especialidad'] = especialidad;

    try {
      await this.supabase
        .from('usuarios')
        .update(updateData)
        .eq('id', id);
    } catch {}

    // Actualizar también en base de datos local
    try {
      await this.supabaseService.client
        .from('usuarios')
        .update(updateData)
        .eq('id', id);
    } catch {}

    if (this.currentProfile?.id === id) {
      const updated = { ...this.currentProfile, ...updateData };
      this.userProfile.next(updated);
      this.saveOfflineProfile(updated);
    }
  }

  async uploadAvatar(file: File): Promise<string> {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `${fileName}`;

    const { error: uploadError } = await this.supabase.storage
      .from('avatars')
      .upload(filePath, file);

    if (uploadError) {
      throw uploadError;
    }

    const { data } = this.supabase.storage
      .from('avatars')
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  async signUp(email: string, password: string, nombre: string, fotoUrl: string, rol: string = 'doctor', especialidad: string = '') {
    let userId = '';
    let authData: any = null;

    // 1. Intentar registrar en Supabase Auth si hay conexión a internet
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre,
            foto_url: fotoUrl,
            rol,
            especialidad
          }
        }
      });
      if (error) {
        console.warn('[AuthService] Supabase signUp aviso:', error.message);
      }
      authData = data;
      if (data?.user?.id) {
        userId = data.user.id;
      }
    } catch (err) {
      console.warn('[AuthService] Supabase Cloud signUp no disponible (offline o error):', err);
    }

    if (!userId) {
      userId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'usr-' + Date.now();
    }

    const newProfile = {
      id: userId,
      correo: email,
      nombre,
      foto_url: fotoUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=random`,
      rol,
      especialidad: especialidad || ''
    };

    // 2. Insertar EXPLÍCITAMENTE en la tabla 'usuarios' de Supabase Cloud
    try {
      await this.supabase.from('usuarios').upsert(newProfile);
      console.log('[AuthService] Perfil de usuario insertado en tabla usuarios de Supabase');
    } catch (cloudInsertErr) {
      console.warn('[AuthService] No se pudo insertar en usuarios de Supabase Cloud:', cloudInsertErr);
    }

    // 3. Insertar SIEMPRE en la base de datos local SQLite (LAN)
    try {
      await this.syncUserToLocalDb(newProfile, password);
      console.log('[AuthService] Perfil de usuario insertado en SQLite local LAN');
    } catch (localInsertErr) {
      console.warn('[AuthService] No se pudo insertar en usuarios de SQLite local:', localInsertErr);
    }

    return authData || { user: newProfile };
  }

  async signIn(email: string, password: string) {
    this.isExplicitSignOut = false;
    let cloudError: any = null;

    // 1. Intentar inicio de sesión en Supabase Cloud si hay conexión
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (!error && data?.session) {
        this.saveOfflineSession(data.session);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(OFFLINE_CRED_HASH_KEY, btoa(email.toLowerCase() + ':' + password));
        }
        await this.loadProfile(data.user.id);
        if (this.userProfile.value) {
          this.syncUserToLocalDb(this.userProfile.value, password);
        }
        return data;
      }
      cloudError = error;
    } catch (err: any) {
      cloudError = err;
    }

    // 2. Si falló la nube pero es por error de red / sin internet, intentar login local LAN
    console.warn('[AuthService] No se pudo autenticar en la nube, activando fallback local LAN:', cloudError);

    try {
      const localAuth = await this.signInLocalLan(email, password);
      if (localAuth?.session) {
        this.saveOfflineSession(localAuth.session);
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(OFFLINE_CRED_HASH_KEY, btoa(email.toLowerCase() + ':' + password));
        }
        await this.loadProfile(localAuth.user.id);
        return localAuth;
      }
    } catch (lanErr) {
      console.warn('[AuthService] Falló login local en LAN:', lanErr);
    }

    // 3. Fallback directo con credenciales guardadas en almacenamiento local
    const cachedHash = typeof localStorage !== 'undefined' ? localStorage.getItem(OFFLINE_CRED_HASH_KEY) : null;
    const currentHash = btoa(email.toLowerCase() + ':' + password);
    const cachedSession = this.getOfflineSession();
    const cachedProfile = this.getOfflineProfile();

    const matchesHash = cachedHash && cachedHash === currentHash;
    const matchesEmail = (cachedSession?.user?.email?.toLowerCase() === email.toLowerCase()) ||
                         (cachedProfile?.correo?.toLowerCase() === email.toLowerCase());

    if (matchesHash || matchesEmail) {
      console.log('[AuthService] Acceso offline concedido por credenciales locales guardadas.');
      const fallbackUser = cachedSession?.user || {
        id: cachedProfile?.id || 'usr-emergency-local',
        email: email,
        user_metadata: { nombre: cachedProfile?.nombre || 'Doctor', rol: cachedProfile?.rol || 'doctor' }
      };
      const fallbackSession = cachedSession || {
        access_token: 'emergency-offline-token',
        user: fallbackUser
      };

      this.userSession.next(fallbackSession);
      this.saveOfflineSession(fallbackSession);

      if (cachedProfile) {
        this.userProfile.next(cachedProfile);
      } else {
        await this.loadProfile(fallbackUser.id);
      }
      return { user: fallbackUser, session: fallbackSession };
    }

    // Si había internet y las credenciales fueron rechazadas por Supabase, reportar el error original
    if (cloudError && cloudError.message && !this.isNetworkError(cloudError)) {
      throw cloudError;
    }

    throw new Error('Sin conexión a internet. Verifique sus credenciales o asegúrese de haber iniciado sesión al menos una vez en este equipo.');
  }

  private async signInLocalLan(email: string, password: string): Promise<any> {
    try {
      const baseUrl = this.supabaseService.isLocal
        ? (this.supabaseService.client as any).getServerUrl?.() || 'http://localhost:3000'
        : 'http://localhost:3000';

      const res = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      // Servidor local no disponible o error
    }
    return null;
  }

  private isNetworkError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    return (
      msg.includes('fetch') ||
      msg.includes('network') ||
      msg.includes('connection') ||
      msg.includes('failed to fetch') ||
      msg.includes('offline') ||
      msg.includes('timeout')
    );
  }

  async signOut() {
    this.isExplicitSignOut = true;
    this.clearOfflineSession();
    try {
      await this.supabase.auth.signOut();
    } catch (e) {
      console.warn('[AuthService] Error cerrando sesión en Supabase:', e);
    }
    this.userSession.next(null);
    this.userProfile.next(null);
  }

  async resetPassword(email: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });
    if (error) throw error;
  }

  private saveOfflineSession(session: any) {
    if (typeof localStorage === 'undefined' || !session?.user) return;
    try {
      const safeSession = {
        access_token: session.access_token || 'local-offline-token',
        user: {
          id: session.user.id,
          email: session.user.email,
          user_metadata: session.user.user_metadata || {}
        },
        saved_at: Date.now()
      };
      localStorage.setItem(OFFLINE_SESSION_KEY, JSON.stringify(safeSession));
    } catch (e) {
      console.warn('[AuthService] Error guardando sesión offline:', e);
    }
  }

  private getOfflineSession(): any | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(OFFLINE_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private saveOfflineProfile(profile: UserProfile) {
    if (typeof localStorage === 'undefined' || !profile) return;
    try {
      localStorage.setItem(OFFLINE_PROFILE_KEY, JSON.stringify(profile));
    } catch (e) {
      console.warn('[AuthService] Error guardando perfil offline:', e);
    }
  }

  private getOfflineProfile(): UserProfile | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(OFFLINE_PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private clearOfflineSession() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(OFFLINE_SESSION_KEY);
      localStorage.removeItem(OFFLINE_PROFILE_KEY);
      localStorage.removeItem(OFFLINE_CRED_HASH_KEY);
    } catch {}
  }
}

