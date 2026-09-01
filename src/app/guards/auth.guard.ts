import { Injectable } from '@angular/core';
import { CanActivate } from '@angular/router';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  async canActivate(): Promise<boolean> {
    // Autenticación desactivada a petición del usuario para pruebas directas
    return true;
  }
}
