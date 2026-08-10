import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {

  private show(type: 'success' | 'error', title: string, message: string = ''): Promise<void> {
    return new Promise((resolve) => {
      // Remove any existing notification
      const existing = document.getElementById('pm-notification-overlay');
      if (existing) existing.remove();

      const isSuccess = type === 'success';
      const accentColor = isSuccess ? '#10b981' : '#ef4444';
      const accentBg = isSuccess ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.12)';
      const iconSvg = isSuccess
        ? `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:56px;height:56px">
             <circle cx="12" cy="12" r="11" stroke="${accentColor}" stroke-width="1.5" opacity="0.3"/>
             <path d="M7.5 12.5l3 3 6-6" stroke="${accentColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
           </svg>`
        : `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:56px;height:56px">
             <circle cx="12" cy="12" r="11" stroke="${accentColor}" stroke-width="1.5" opacity="0.3"/>
             <path d="M9 9l6 6M15 9l-6 6" stroke="${accentColor}" stroke-width="2" stroke-linecap="round"/>
           </svg>`;

      const overlay = document.createElement('div');
      overlay.id = 'pm-notification-overlay';
      overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 2147483647;
        display: flex; align-items: center; justify-content: center;
        background: rgba(2, 6, 23, 0.75);
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        animation: pmFadeIn 0.2s ease;
      `;

      const card = document.createElement('div');
      card.style.cssText = `
        background: #1e293b;
        border: 1px solid rgba(51, 65, 85, 0.8);
        border-radius: 24px;
        padding: 40px 36px 32px;
        max-width: 380px; width: 90%;
        text-align: center;
        box-shadow: 0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.05);
        animation: pmSlideUp 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
        position: relative;
      `;

      const iconWrap = document.createElement('div');
      iconWrap.style.cssText = `
        width: 88px; height: 88px; border-radius: 50%;
        background: ${accentBg};
        display: flex; align-items: center; justify-content: center;
        margin: 0 auto 20px;
        box-shadow: 0 0 0 12px ${accentBg.replace('0.12', '0.06')};
      `;
      iconWrap.innerHTML = iconSvg;

      const titleEl = document.createElement('h2');
      titleEl.textContent = title;
      titleEl.style.cssText = `
        color: #f8fafc; font-size: 20px; font-weight: 900;
        font-family: 'Inter', sans-serif; letter-spacing: -0.5px;
        text-transform: uppercase; margin: 0 0 10px;
      `;

      const msgEl = document.createElement('p');
      msgEl.textContent = message;
      msgEl.style.cssText = `
        color: #94a3b8; font-size: 14px; font-weight: 500;
        font-family: 'Inter', sans-serif; margin: 0 0 28px; line-height: 1.5;
      `;

      const btn = document.createElement('button');
      btn.textContent = isSuccess ? 'ENTENDIDO' : 'CERRAR';
      btn.style.cssText = `
        background: ${accentColor}; color: white;
        border: none; border-radius: 14px;
        padding: 14px 36px; font-size: 11px; font-weight: 900;
        font-family: 'Inter', sans-serif; letter-spacing: 2px;
        text-transform: uppercase; cursor: pointer;
        box-shadow: 0 8px 24px ${accentColor}40;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
        width: 100%;
      `;
      btn.onmouseover = () => {
        btn.style.transform = 'scale(1.03)';
        btn.style.boxShadow = `0 12px 32px ${accentColor}60`;
      };
      btn.onmouseleave = () => {
        btn.style.transform = 'scale(1)';
        btn.style.boxShadow = `0 8px 24px ${accentColor}40`;
      };
      btn.onclick = () => {
        overlay.style.animation = 'pmFadeOut 0.2s ease forwards';
        setTimeout(() => { overlay.remove(); resolve(); }, 200);
      };

      card.appendChild(iconWrap);
      card.appendChild(titleEl);
      if (message) card.appendChild(msgEl);
      card.appendChild(btn);
      overlay.appendChild(card);

      // Inject keyframe animations if not already present
      if (!document.getElementById('pm-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'pm-notification-styles';
        style.textContent = `
          @keyframes pmFadeIn { from { opacity:0 } to { opacity:1 } }
          @keyframes pmFadeOut { from { opacity:1 } to { opacity:0 } }
          @keyframes pmSlideUp { from { opacity:0; transform:translateY(20px) scale(0.95) } to { opacity:1; transform:translateY(0) scale(1) } }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(overlay);
    });
  }

  async showSuccess(title: string, message: string = ''): Promise<void> {
    return this.show('success', title, message);
  }

  async showError(title: string, message: string = ''): Promise<void> {
    return this.show('error', title, message);
  }
}
