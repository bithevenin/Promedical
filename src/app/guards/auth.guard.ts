import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService, private router: Router) {}

  async canActivate(): Promise<boolean | UrlTree> {
    const isActive = await this.authService.isSessionActive();
    if (isActive) {
      return true;
    } else {
      return this.router.createUrlTree(['/auth/login'], { queryParams: { authWarning: true } });
    }
  }
}

