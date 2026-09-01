const express = require('express');
const cors = require('cors');
const http = require('node:http');
const { WebSocketServer, WebSocket } = require('ws');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const LocalDB = require('./db.cjs');

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

function startServer(port = 3000, customDbPath = null) {
  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  const db = new LocalDB(customDbPath);

  app.use(cors({ origin: '*' }));
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Broadcast helper — sends full payload to every connected LAN client
  function broadcastChange(payload) {
    const message = JSON.stringify(payload);
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.send(message); } catch {}
      }
    });
  }

  // Keep WebSocket connections alive with server-side ping every 20s
  const heartbeatInterval = setInterval(() => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try { client.ping(); } catch {}
      } else if (client.readyState !== WebSocket.CONNECTING) {
        client.terminate();
      }
    });
  }, 20000);

  wss.on('close', () => clearInterval(heartbeatInterval));

  wss.on('connection', (ws, req) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (msg) => {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch {}
    });
    ws.send(JSON.stringify({ event: 'CONNECTED', message: 'Promedical LAN Realtime Connected' }));
  });

  // Status & Info endpoint
  app.get('/api/status', (req, res) => {
    res.json({
      status: 'online',
      system: 'Promedical Local LAN Server',
      version: '1.0.0',
      port,
      dbPath: db.dbPath,
      localIps: getLocalIpAddresses(),
      timestamp: new Date().toISOString()
    });
  });

  // Auth endpoints for offline operation
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    try {
      const users = db.select('usuarios', { filters: { correo: email } });
      const user = users[0];
      if (!user) {
        // Auto-create user profile if it's first login locally
        const newUser = {
          id: 'usr-' + Date.now(),
          correo: email,
          nombre: email.split('@')[0],
          rol: 'doctor',
          especialidad: 'Medicina General',
          password_hash: password || '12345678'
        };
        db.insert('usuarios', newUser);
        return res.json({
          user: { id: newUser.id, email: newUser.correo, user_metadata: { nombre: newUser.nombre, rol: newUser.rol } },
          session: { access_token: 'local-token-' + newUser.id, user: newUser }
        });
      }

      return res.json({
        user: { id: user.id, email: user.correo, user_metadata: { nombre: user.nombre, rol: user.rol, especialidad: user.especialidad } },
        session: { access_token: 'local-token-' + user.id, user: user }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/auth/signup', (req, res) => {
    const { email, password, data } = req.body;
    try {
      const id = 'usr-' + Date.now();
      const user = {
        id,
        correo: email,
        nombre: data?.nombre || email.split('@')[0],
        rol: data?.rol || 'doctor',
        especialidad: data?.especialidad || '',
        foto_url: data?.foto_url || '',
        password_hash: password || '123456'
      };
      db.upsert('usuarios', user, 'correo');
      res.json({
        user: { id: user.id, email: user.correo, user_metadata: data },
        session: { access_token: 'local-token-' + user.id, user }
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Generic Query Parser for Table Endpoints
  // Format: /api/data/:table?key=value&key=eq.val&key=ilike.val&order=col.asc&limit=50
  app.get('/api/data/:table', (req, res) => {
    const { table } = req.params;
    const query = req.query;

    const filters = {};
    let order = null;
    let limit = null;
    let offset = null;

    for (const [key, rawVal] of Object.entries(query)) {
      if (key === 'order') {
        const parts = String(rawVal).split('.');
        order = { column: parts[0], ascending: parts[1] !== 'desc' };
      } else if (key === 'limit') {
        limit = Number(rawVal);
      } else if (key === 'offset') {
        offset = Number(rawVal);
      } else if (key === 'select') {
        // ignore for now or pass through
      } else {
        const strVal = String(rawVal);
        if (strVal.startsWith('eq.')) {
          filters[key] = { op: 'eq', val: strVal.substring(3) };
        } else if (strVal.startsWith('neq.')) {
          filters[key] = { op: 'neq', val: strVal.substring(4) };
        } else if (strVal.startsWith('ilike.')) {
          filters[key] = { op: 'ilike', val: strVal.substring(6) };
        } else if (strVal.startsWith('gte.')) {
          filters[key] = { op: 'gte', val: strVal.substring(4) };
        } else if (strVal.startsWith('lte.')) {
          filters[key] = { op: 'lte', val: strVal.substring(4) };
        } else if (strVal.startsWith('in.(') && strVal.endsWith(')')) {
          const list = strVal.substring(4, strVal.length - 1).split(',');
          filters[key] = { op: 'in', val: list };
        } else {
          filters[key] = strVal;
        }
      }
    }

    try {
      const rows = db.select(table, { filters, order, limit, offset });
      res.json(rows);
    } catch (err) {
      console.error(`[GET /api/data/${table}] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/data/:table', (req, res) => {
    const { table } = req.params;
    const { isUpsert, onConflict, data } = req.body;
    const records = data !== undefined ? data : req.body;

    try {
      let result;
      if (isUpsert) {
        result = db.upsert(table, records, onConflict || 'id');
      } else {
        result = db.insert(table, records);
      }

      broadcastChange({
        type: 'broadcast',
        event: isUpsert ? 'UPSERT' : 'INSERT',
        table,
        record: result
      });

      res.json(result);
    } catch (err) {
      console.error(`[POST /api/data/${table}] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/data/:table', (req, res) => {
    const { table } = req.params;
    const query = req.query;
    const data = req.body;

    const filters = {};
    for (const [key, rawVal] of Object.entries(query)) {
      const strVal = String(rawVal);
      if (strVal.startsWith('eq.')) {
        filters[key] = strVal.substring(3);
      } else {
        filters[key] = strVal;
      }
    }

    try {
      // db.update() already does SELECT after UPDATE, so updated[0] is the full record
      const updated = db.update(table, data, filters);
      const fullRecord = updated && updated.length > 0 ? updated[0] : { ...data, ...filters };
      broadcastChange({
        type: 'broadcast',
        event: 'UPDATE',
        table,
        record: fullRecord    // ← registro COMPLETO para que la PC receptora no tenga que hacer otra petición
      });
      res.json(updated);
    } catch (err) {
      console.error(`[PUT /api/data/${table}] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/data/:table', (req, res) => {
    const { table } = req.params;
    const query = req.query;

    const filters = {};
    for (const [key, rawVal] of Object.entries(query)) {
      const strVal = String(rawVal);
      if (strVal.startsWith('eq.')) {
        filters[key] = strVal.substring(3);
      } else {
        filters[key] = strVal;
      }
    }

    try {
      const result = db.delete(table, filters);
      broadcastChange({
        type: 'broadcast',
        event: 'DELETE',
        table,
        record: filters,   // ← identifica cuál row eliminar en PCs receptoras
        filters
      });
      res.json(result);
    } catch (err) {
      console.error(`[DELETE /api/data/${table}] Error:`, err);
      res.status(500).json({ error: err.message });
    }
  });

  // Broadcast reload event to all connected LAN clients
  app.post('/api/sync/broadcast-reload', (req, res) => {
    broadcastChange({
      type: 'broadcast',
      event: 'RELOAD_ALL',
      table: '*'
    });
    res.json({ success: true, message: 'Reload signal broadcasted to all LAN clients' });
  });

  // Backup & Restore
  app.get('/api/database/backup', (req, res) => {
    try {
      res.download(db.dbPath, 'promedical_backup.db');
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  return new Promise((resolve, reject) => {
    server.listen(port, '0.0.0.0', () => {
      const ips = getLocalIpAddresses();
      console.log(`\n======================================================`);
      console.log(` Promedical Local LAN Server Running!`);
      console.log(` Local:            http://localhost:${port}`);
      ips.forEach(ip => {
        console.log(` Red Local (LAN):  http://${ip}:${port}`);
      });
      console.log(` Base de datos:    ${db.dbPath}`);
      console.log(`======================================================\n`);
      resolve({ server, app, wss, db, port, ips });
    });
    server.on('error', reject);
  });
}

if (require.main === module) {
  startServer(process.env.PORT || 3000);
}

module.exports = { startServer, getLocalIpAddresses };
