import { Injectable } from '@angular/core';
import { SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { environment } from 'src/environments/environment';
import { BehaviorSubject } from 'rxjs';
import { UserProfile } from '../models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private userSession = new BehaviorSubject<Session | null>(null);

  constructor(private supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.cloudClient;
    this.supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      this.userSession.next(session);
      if (session?.user) {
        this.loadProfile(session.user.id);
      } else {
        this.userProfile.next(null);
      }
    });
  }

  async isSessionActive(): Promise<boolean> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      if (session?.user) {
        this.userSession.next(session);
        if (!this.userProfile.value) {
          await this.loadProfile(session.user.id);
        }
        return true;
      }
    } catch (e) {
      console.warn('[AuthService] Error checking session:', e);
    }
    return false;
  }

  get user$() {
    return this.userSession.asObservable();
  }

  get currentUser() {
    return this.userSession.value;
  }

  private userProfile = new BehaviorSubject<UserProfile | null>(null);
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
    try {
      // 1. Intentar buscar por ID directo
      let { data, error } = await this.supabase
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .maybeSingle();

      const session = this.userSession.value;
      const userEmail = session?.user?.email;

      // 2. Si no coincide por ID (por migración de Auth), buscar por correo y sincronizar el ID
      if ((!data || error) && userEmail) {
        const { data: dataByEmail } = await this.supabase
          .from('usuarios')
          .select('*')
          .ilike('correo', userEmail)
          .maybeSingle();

        if (dataByEmail) {
          data = { ...dataByEmail, id: uid };
          await this.supabase
            .from('usuarios')
            .update({ id: uid })
            .ilike('correo', userEmail);
        }
      }

      // 3. Respaldo: Si el usuario existe en Auth pero no en la tabla usuarios, crear perfil por defecto
      if (!data && session?.user) {
        const meta = session.user.user_metadata || {};
        const newProfile: UserProfile = {
          id: uid,
          nombre: meta['nombre'] || userEmail?.split('@')[0] || 'Usuario',
          correo: userEmail || '',
          foto_url: meta['foto_url'] || '',
          rol: meta['rol'] || 'doctor',
          especialidad: meta['especialidad'] || ''
        };

        await this.supabase.from('usuarios').upsert(newProfile);
        data = newProfile;
      }

      if (data) {
        this.userProfile.next(data);
      }
    } catch (error) {
      console.error('Error loading user profile:', error);
    }
  }

  async getAllUsers() {
    const { data, error } = await this.supabase
      .from('usuarios')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async updateUser(id: string, nombre: string, fotoUrl: string, rol: string, especialidad?: string) {
    const updateData: Record<string, string> = { nombre, foto_url: fotoUrl, rol };
    if (especialidad !== undefined) updateData['especialidad'] = especialidad;

    const { error } = await this.supabase
      .from('usuarios')
      .update(updateData)
      .eq('id', id);
    if (error) throw error;
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
    const { data: authData, error: authError } = await this.supabase.auth.signUp({
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

    if (authError) throw authError;

    // Ya no es necesario insertar manualmente en 'usuarios', el Trigger lo hace automáticamente.

    return authData;
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async signOut() {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async resetPassword(email: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`, // URL para actualizar password
    });
    if (error) throw error;
  }
}
