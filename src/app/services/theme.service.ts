import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  isDarkMode = signal<boolean>(true);

  constructor() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      this.setLightMode();
    } else {
      this.setDarkMode();
    }
  }

  toggleTheme() {
    if (this.isDarkMode()) {
      this.setLightMode();
    } else {
      this.setDarkMode();
    }
  }

  private setLightMode() {
    this.isDarkMode.set(false);
    document.body.classList.add('light-theme');
    document.body.classList.remove('dark');
    localStorage.setItem('theme', 'light');
  }

  private setDarkMode() {
    this.isDarkMode.set(true);
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark');
    localStorage.setItem('theme', 'dark');
  }
}
