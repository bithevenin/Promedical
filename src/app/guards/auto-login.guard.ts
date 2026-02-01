import { Injectable } from '@angular/core';
import { CanActivate, Router, UrlTree } from '@angular/router';
import { Observable } from 'rxjs';
import { map, take } from 'rxjs/operators';
import { AuthService } from '../services/auth.service';

@Injectable({
  providedIn: 'root'
})
export class AutoLoginGuard implements CanActivate {

  constructor(private authService: AuthService, private router: Router) {}

  canActivate(): Observable<boolean | UrlTree> {
    return this.authService.user$.pipe(
      take(1),
      map(user => {
        if (user) {
          // If logged in, redirect away from login page to main
          return this.router.createUrlTree(['/main']);
        } else {
          return true;
        }
      })
    );
  }
}
