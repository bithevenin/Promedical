const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { autoUpdater } = require('electron-updater');
const { startServer, getLocalIpAddresses } = require('../server/server.cjs');

let mainWindow = null;
let serverInstance = null;

// Configure autoUpdater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

const configPath = path.join(app.getPath('userData'), 'promedical_lan_config.json');

function loadConfig() {
  const defaultConfig = {
    mode: 'server', // 'server' (Host / Principal) or 'client' (Terminal)
    serverHost: 'localhost',
    port: 3000
  };

  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, 'utf8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('[Electron] Error loading config, using default:', err);
  }
  return defaultConfig;
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Electron] Error saving config:', err);
    return false;
  }
}

function setupAutoUpdater() {
  const ghToken = process.env.GH_TOKEN || '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';
  if (ghToken) {
    try {
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'bithevenin',
        repo: 'Promedical',
        private: true,
        token: ghToken
      });
      console.log('[AutoUpdater] Configurado para repositorio privado usando token de GitHub');
    } catch (e) {
      console.error('[AutoUpdater] Error configurando feed privado:', e);
    }
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', { status: 'checking', message: 'Buscando actualizaciones...' });
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'available',
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes,
        message: `Nueva versión v${info.version} disponible`
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Update not available');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'not-available',
        version: info?.version,
        message: 'El sistema ya está en la última versión'
      });
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err);
    let message = err.message || 'Error al comprobar actualizaciones';
    if (message.includes('404') || message.includes('releases.atom')) {
      message = 'No se encontró ninguna versión publicada en GitHub (o el repositorio es privado/requiere token).';
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'error',
        message
      });
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    console.log(`[AutoUpdater] Download progress: ${percent}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'downloading',
        percent,
        bytesPerSecond: progressObj.bytesPerSecond,
        transferred: progressObj.transferred,
        total: progressObj.total,
        message: `Descargando actualización: ${percent}%`
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'downloaded',
        version: info.version,
        message: `Versión v${info.version} lista para instalar`
      });
    }
  });
}

async function createWindow() {
  const config = loadConfig();

  // If running as Server/Host, start local Express/WebSocket server
  if (config.mode === 'server') {
    try {
      const dbDir = path.join(app.getPath('userData'), 'db');
      serverInstance = await startServer(config.port || 3000, dbDir);
      console.log('[Electron] Embedded LAN Server started on port', config.port);
    } catch (err) {
      console.error('[Electron] Failed to start embedded server:', err);
    }
  }

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 868,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f172a',
    title: 'Promedical - Sistema Médico Local',
    icon: path.join(__dirname, '../favicon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow LAN connections without CORS blocks in desktop webview
    }
  });

  mainWindow.maximize();

  // Initialize auto-updater events
  setupAutoUpdater();

  // Allow F12 or Ctrl+Shift+I to open DevTools for diagnostic support
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Page failed to load:', errorCode, errorDescription);
    const indexPath = path.join(__dirname, '../www/index.html');
    if (fs.existsSync(indexPath)) {
      setTimeout(() => {
        if (mainWindow) mainWindow.loadFile(indexPath);
      }, 500);
    }
  });

  const isDev = process.env.NODE_ENV === 'development' || process.argv.includes('--dev');
  if (isDev) {
    mainWindow.loadURL('http://localhost:4200');
  } else {
    const indexPath = path.join(__dirname, '../www/index.html');
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
      // Check for updates on startup if not dev
      setTimeout(() => {
        try {
          autoUpdater.checkForUpdates().catch(e => console.log('[AutoUpdater] Silent check error:', e.message));
        } catch (e) {
          console.log('[AutoUpdater] Init check error:', e.message);
        }
      }, 4000);
    } else {
      mainWindow.loadURL('http://localhost:4200');
    }
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Setup IPC handlers
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.handle('save-config', (event, newConfig) => {
  const success = saveConfig(newConfig);
  return success;
});

ipcMain.handle('get-network-info', () => {
  const ips = getLocalIpAddresses();
  const config = loadConfig();
  return {
    ips,
    mode: config.mode,
    port: config.port,
    serverHost: config.serverHost,
    activeUrl: config.mode === 'server' 
      ? `http://${ips[0] || 'localhost'}:${config.port}`
      : `http://${config.serverHost}:${config.port}`
  };
});

ipcMain.handle('restart-app', () => {
  app.relaunch();
  app.exit(0);
});

ipcMain.handle('check-for-updates', async () => {
  try {
    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo };
  } catch (err) {
    let msg = err.message || 'Error al comprobar actualizaciones';
    if (msg.includes('404') || msg.includes('releases.atom')) {
      msg = 'No se encontró ninguna versión publicada en GitHub (o el repositorio es privado/requiere token).';
    }
    return { success: false, error: msg };
  }
});

ipcMain.handle('download-update', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall(false, true);
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
