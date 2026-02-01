import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from 'src/environments/environment';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private supabase: SupabaseClient;
  private userSession = new BehaviorSubject<any>(null);

  constructor() {
    this.supabase = createClient(environment.supabaseUrl, environment.supabaseKey);
    this.supabase.auth.onAuthStateChange((event, session) => {
      this.userSession.next(session);
      if (session?.user) {
        this.loadProfile(session.user.id);
      } else {
        this.userProfile.next(null);
      }
    });
  }

  get user$() {
    return this.userSession.asObservable();
  }

  get currentUser() {
    return this.userSession.value;
  }

  private userProfile = new BehaviorSubject<any>(null);
  get profile$() {
    return this.userProfile.asObservable();
  }

  async loadProfile(uid: string) {
    const { data, error } = await this.supabase
      .from('usuarios')
      .select('*')
      .eq('id', uid)
      .single();
    
    if (data) {
      this.userProfile.next(data);
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
    const updateData: any = { nombre, foto_url: fotoUrl, rol };
    if (especialidad !== undefined) updateData.especialidad = especialidad;

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
