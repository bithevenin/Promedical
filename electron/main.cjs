const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { autoUpdater } = require('electron-updater');

// Disable default menu bar (File, Edit, View, Window, Help)
Menu.setApplicationMenu(null);

let mainWindow = null;
let serverInstance = null;

// Configure autoUpdater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const configPath = path.join(app.getPath('userData'), 'promedical_lan_config.json');
const printerConfigPath = path.join(app.getPath('userData'), 'promedical_printer_config.json');

function loadConfig() {
  const defaultConfig = {
    mode: 'server', // 'server' (Host / Principal) or 'client' (Terminal)
    serverHost: '192.168.0.101',
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
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('[Electron] LAN config successfully saved to:', configPath, config);
    return true;
  } catch (err) {
    console.error('[Electron] Error saving config:', err);
    return false;
  }
}

function loadPrinterConfig() {
  const defaultConfig = {
    selectedPrinter: '', // '' significa impresora predeterminada del sistema
    silent: true,
    pageSize: 'Letter',
    landscape: false,
    copies: 1,
    margins: 'none',
    printBackground: true
  };
  try {
    if (fs.existsSync(printerConfigPath)) {
      const data = fs.readFileSync(printerConfigPath, 'utf8');
      return { ...defaultConfig, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('[Electron] Error loading printer config:', err);
  }
  return defaultConfig;
}

function savePrinterConfig(config) {
  try {
    const dir = path.dirname(printerConfigPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(printerConfigPath, JSON.stringify(config, null, 2), 'utf8');
    console.log('[Electron] Printer config successfully saved to:', printerConfigPath, config);
    return true;
  } catch (err) {
    console.error('[Electron] Error saving printer config:', err);
    return false;
  }
}

function setupAutoUpdater() {
  autoUpdater.logger = console;

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for update...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-status', {
        status: 'checking',
        message: 'Comprobando actualizaciones...'
      });
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

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) addresses.push(iface.address);
    }
  }
  return addresses;
}

async function startEmbeddedServer(port, dbDir) {
  try {
    if (serverInstance && serverInstance.server) {
      try { serverInstance.server.close(); } catch {}
      serverInstance = null;
    }
    const { startServer } = require('../server/server.cjs');
    serverInstance = await startServer(port, dbDir);
    console.log('[Electron] In-process LAN Server running on port', port, 'dbDir:', dbDir);
    return serverInstance;
  } catch (err) {
    console.error('[Electron] Error starting LAN server:', err);
    throw err;
  }
}

async function createWindow() {
  const config = loadConfig();

  // Ensure embedded server only runs in server mode (Host).
  // In client (terminal) mode, do NOT run local server process.
  const shouldStartServer = config.mode !== 'client';
  if (shouldStartServer && !serverInstance) {
    try {
      const dbDir = path.join(app.getPath('userData'), 'db');
      await startEmbeddedServer(config.port || 3000, dbDir);
      console.log('[Electron] Embedded LAN Server started on port', config.port || 3000);
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
    icon: path.join(__dirname, '../build/icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false // allow LAN connections without CORS blocks in desktop webview
    }
  });

  mainWindow.setMenu(null);
  mainWindow.maximize();

  // Prevenir que ventanas secundarias o popups pierdan la sesión o abran instancias aisladas
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http:') || url.startsWith('https:')) {
      if (!url.includes('localhost') && !url.includes('127.0.0.1')) {
        require('electron').shell.openExternal(url);
        return { action: 'deny' };
      }
    }
    return { action: 'allow' };
  });

  // Prevenir Super Zoom excesivo por escalado de pantalla en Windows
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.setZoomFactor(0.88);
  });

  // Atajos de Teclado: F12 (DevTools), Ctrl + / Ctrl - / Ctrl 0 (Zoom)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key.toLowerCase() === 'i')) {
      mainWindow.webContents.toggleDevTools();
    }
    if (input.control && (input.key === '+' || input.key === '=')) {
      const currentZoom = mainWindow.webContents.getZoomFactor();
      mainWindow.webContents.setZoomFactor(Math.min(currentZoom + 0.05, 1.3));
    }
    if (input.control && (input.key === '-' || input.key === '_')) {
      const currentZoom = mainWindow.webContents.getZoomFactor();
      mainWindow.webContents.setZoomFactor(Math.max(currentZoom - 0.05, 0.6));
    }
    if (input.control && input.key === '0') {
      mainWindow.webContents.setZoomFactor(0.88);
    }
  });

  // Initialize auto-updater events
  setupAutoUpdater();

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[Electron] Page failed to load:', errorCode, errorDescription);
    const indexPath = path.join(__dirname, '../www/index.html');
    if (fs.existsSync(indexPath)) {
      setTimeout(() => {
        if (mainWindow) mainWindow.loadFile(indexPath);
      }, 500);
    }
  });

  // Clear any legacy ServiceWorkers or corrupted cache storage at Chromium session level
  mainWindow.webContents.session.clearStorageData({
    storages: ['serviceworkers', 'cachestorage']
  }).catch(() => {});

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

ipcMain.handle('save-config', async (event, newConfig) => {
  const success = saveConfig(newConfig);
  if (success) {
    if (newConfig.mode === 'server' && !serverInstance) {
      try {
        const dbDir = path.join(app.getPath('userData'), 'db');
        await startEmbeddedServer(newConfig.port || 3000, dbDir);
        console.log('[Electron] In-process LAN Server started via IPC on port', newConfig.port || 3000);
      } catch (err) {
        console.error('[Electron] Failed to start server via IPC:', err);
      }
    } else if (newConfig.mode === 'client' && serverInstance && serverInstance.server) {
      try {
        serverInstance.server.close();
        serverInstance = null;
        console.log('[Electron] Stopped local server process because client mode was set');
      } catch (err) {
        console.error('[Electron] Error stopping server:', err);
      }
    }
  }
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

// --- IPC Impresoras y Manejo Directo de Impresión ---
ipcMain.handle('get-printers', async () => {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      const printers = await mainWindow.webContents.getPrintersAsync();
      return printers;
    }
    return [];
  } catch (err) {
    console.error('[Electron] Error al obtener lista de impresoras:', err);
    return [];
  }
});

ipcMain.handle('get-printer-config', () => {
  return loadPrinterConfig();
});

ipcMain.handle('save-printer-config', (event, config) => {
  return savePrinterConfig(config);
});

ipcMain.handle('print-html', async (event, options = {}) => {
  const {
    html,
    printerName = '',
    silent = true,
    copies = 1,
    pageSize = 'Letter',
    landscape = false,
    margins = 'none',
    printBackground = true
  } = options;

  let printWin = new BrowserWindow({
    show: false,
    width: 800,
    height: 1100,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  return new Promise((resolve) => {
    let handled = false;
    const cleanup = () => {
      if (!handled) {
        handled = true;
        if (printWin && !printWin.isDestroyed()) {
          printWin.destroy();
          printWin = null;
        }
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      resolve({ success: false, error: 'Tiempo de espera agotado al comunicarse con la impresora.' });
    }, 30000);

    printWin.webContents.on('did-finish-load', () => {
      setTimeout(() => {
        const marginMap = {
          none: { marginType: 'none' },
          default: { marginType: 'default' },
          minimum: { marginType: 'minimum' }
        };

        const printSettings = {
          silent: silent !== false,
          printBackground: printBackground !== false,
          deviceName: printerName || '',
          copies: Math.max(1, parseInt(copies, 10) || 1),
          pageSize: pageSize || 'Letter',
          landscape: Boolean(landscape),
          margins: marginMap[margins] || { marginType: 'none' }
        };

        printWin.webContents.print(printSettings, (success, failureReason) => {
          clearTimeout(timeout);
          cleanup();
          if (!success) {
            console.error('[Electron] Error al imprimir:', failureReason);
            resolve({ success: false, error: failureReason || 'Error al comunicarse con la impresora' });
          } else {
            console.log('[Electron] Impresión enviada exitosamente a:', printerName || 'Predeterminada');
            resolve({ success: true, printer: printerName || 'Predeterminada' });
          }
        });
      }, 350);
    });

    printWin.webContents.on('did-fail-load', (e, code, desc) => {
      clearTimeout(timeout);
      cleanup();
      resolve({ success: false, error: `Error cargando plantilla: ${desc}` });
    });

    printWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  });
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

// Single Instance Lock: Garantiza una única instancia activa para no duplicar procesos ni romper la sesión
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[Electron] Ya existe una instancia activa de ProMedical. Enfocando ventana existente y cerrando duplicado.');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Al intentar abrir otra ventana/icono, enfocamos la existente preservando la sesión activa al 100%
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(createWindow);
}

app.on('window-all-closed', () => {
  if (serverInstance && serverInstance.server) {
    try { serverInstance.server.close(); } catch {}
    serverInstance = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serverInstance && serverInstance.server) {
    try { serverInstance.server.close(); } catch {}
    serverInstance = null;
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
