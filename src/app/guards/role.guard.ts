import { Injectable } from '@angular/core';
import { CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take, filter, switchMap } from 'rxjs/operators';
import { of, Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class RoleGuard implements CanActivate {

  constructor(private auth: AuthService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    const expectedRoles = route.data['roles'] as Array<string>;

    // Esperar a que el perfil esté cargado
    return this.auth.profile$.pipe(
      filter(profile => profile !== null), // Esperar a que tengamos datos del perfil
      take(1),
      map(profile => {
        if (!profile || !expectedRoles.includes(profile.rol)) {
          console.warn('Acceso denegado: Rol insuficiente');
          this.router.navigate(['/main']);
          return false;
        }
        return true;
      })
    );
  }
}
