const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

class LocalDB {
  constructor(customPath) {
    const dataDir = customPath || path.join(process.env.APPDATA || process.env.HOME || '.', '.promedical_data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.dbPath = path.join(dataDir, 'promedical_local.db');
    console.log(`[LocalDB] Initializing SQLite database at: ${this.dbPath}`);
    this.db = new DatabaseSync(this.dbPath);
    this.initTables();
    this.seedInitialData();
  }

  initTables() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        correo TEXT UNIQUE,
        nombre TEXT,
        rol TEXT DEFAULT 'doctor',
        especialidad TEXT,
        foto_url TEXT,
        password_hash TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS pacientes (
        cedula TEXT PRIMARY KEY,
        nombre TEXT NOT NULL,
        edad INTEGER,
        fecha_nacimiento TEXT,
        profesion TEXT,
        seguro TEXT,
        sexo TEXT,
        telefono TEXT,
        email TEXT,
        altura TEXT,
        peso TEXT,
        carnet_seguro TEXT,
        antecedentes_personales TEXT,
        antecedentes_familiares TEXT,
        alergias TEXT,
        tipo_sangre TEXT,
        foto_url TEXT,
        direccion TEXT,
        signos_vitales TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS consultas (
        id TEXT PRIMARY KEY,
        paciente_cedula TEXT,
        paciente_nombre TEXT,
        fecha TEXT,
        motivo TEXT,
        diagnostico TEXT,
        tratamiento TEXT,
        notas TEXT,
        examenes_indicados TEXT,
        sintomas TEXT,
        signos_vitales TEXT,
        medicamentos_recetados TEXT,
        proxima_cita TEXT,
        costo_consulta REAL DEFAULT 0,
        seguro_aplicado TEXT,
        monto_cobertura REAL DEFAULT 0,
        diferencia_paciente REAL DEFAULT 0,
        tipo_pago TEXT,
        estado TEXT DEFAULT 'completada',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS citas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        turno INTEGER,
        nombre TEXT,
        cedula TEXT,
        edad INTEGER,
        fecha_nacimiento TEXT,
        seguro TEXT,
        sexo TEXT,
        fecha TEXT,
        estado TEXT DEFAULT 'espera',
        hora TEXT,
        altura TEXT,
        peso TEXT,
        profesion TEXT,
        instruccion_cobro TEXT DEFAULT 'cobrar',
        monto_cobrado REAL DEFAULT 0,
        carnet_seguro TEXT,
        telefono TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS signos_vitales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paciente_cedula TEXT,
        consulta_id TEXT,
        fecha TEXT,
        presion_arterial TEXT,
        frecuencia_cardiaca INTEGER,
        temperatura REAL,
        peso REAL,
        talla REAL,
        imc REAL,
        saturacion_oxigeno REAL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS transacciones (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        concepto TEXT,
        tipo TEXT,
        monto REAL,
        metodo_pago TEXT,
        fecha TEXT,
        categoria TEXT,
        paciente_cedula TEXT,
        doctor_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facturas_seguro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        paciente_cedula TEXT,
        paciente_nombre TEXT,
        numero_reclamacion TEXT,
        ars_nombre TEXT,
        nss TEXT,
        ncf TEXT,
        fecha TEXT,
        monto_reclamado REAL DEFAULT 0,
        monto_cobertura REAL DEFAULT 0,
        diferencia_paciente REAL DEFAULT 0,
        estado TEXT DEFAULT 'pendiente',
        fecha_pago TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS reportes_pagos_seguro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ars_nombre TEXT,
        numero_transferencia TEXT,
        fecha_pago TEXT,
        total_reclamado REAL DEFAULT 0,
        total_pagado REAL DEFAULT 0,
        total_glosas REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS configuracion_doctor (
        id TEXT PRIMARY KEY,
        nombre_doctor TEXT,
        especialidad TEXT,
        exequatur TEXT,
        email TEXT,
        foto_url TEXT,
        monto_consulta_particular REAL DEFAULT 1500,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tarifas_seguro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        seguro TEXT UNIQUE,
        monto_cobertura REAL DEFAULT 0,
        copago REAL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  seedInitialData() {
    const docQuery = this.db.prepare('SELECT count(*) as count FROM configuracion_doctor');
    const docRow = docQuery.get();
    if (docRow && docRow.count === 0) {
      const insertDoc = this.db.prepare(`
        INSERT INTO configuracion_doctor (id, nombre_doctor, especialidad, exequatur, email, monto_consulta_particular)
        VALUES ('1', 'Dr. Thevenin', 'Urólogo', '12345-67', 'doctor@promedical.local', 1500)
      `);
      insertDoc.run();
    }

    const tarifQuery = this.db.prepare('SELECT count(*) as count FROM tarifas_seguro');
    const tarifRow = tarifQuery.get();
    if (tarifRow && tarifRow.count === 0) {
      const defaultTarifas = [
        { seguro: 'ARS Humano', monto_cobertura: 500, copago: 200 },
        { seguro: 'ARS Primera', monto_cobertura: 450, copago: 250 },
        { seguro: 'ARS Senasa', monto_cobertura: 400, copago: 0 },
        { seguro: 'ARS Mapfre', monto_cobertura: 500, copago: 200 },
        { seguro: 'ARS Futuro', monto_cobertura: 450, copago: 250 },
        { seguro: 'ARS Palic', monto_cobertura: 480, copago: 220 }
      ];
      const insertTarifa = this.db.prepare(`
        INSERT INTO tarifas_seguro (seguro, monto_cobertura, copago)
        VALUES (?, ?, ?)
      `);
      for (const t of defaultTarifas) {
        insertTarifa.run(t.seguro, t.monto_cobertura, t.copago);
      }
    }

    const userQuery = this.db.prepare('SELECT count(*) as count FROM usuarios');
    const userRow = userQuery.get();
    if (userRow && userRow.count === 0) {
      const insertUser = this.db.prepare(`
        INSERT INTO usuarios (id, correo, nombre, rol, especialidad, password_hash)
        VALUES 
          ('local-doc-1', 'doctor@promedical.local', 'Dr. Thevenin', 'doctor', 'Urólogo', '123456'),
          ('local-sec-1', 'secretaria@promedical.local', 'Recepcionista', 'secretaria', 'Recepción', '123456'),
          ('local-adm-1', 'admin@promedical.local', 'Administrador', 'admin', 'Sistemas', '123456')
      `);
      insertUser.run();
    }
  }

  // --- Dynamic Query Execution ---

  select(table, { filters = {}, order = null, limit = null, offset = null } = {}) {
    let sql = `SELECT * FROM ${table}`;
    const params = [];
    const whereClauses = [];

    for (const [key, val] of Object.entries(filters)) {
      if (val === null || val === undefined) continue;
      if (typeof val === 'object' && val.op) {
        if (val.op === 'eq') {
          whereClauses.push(`${key} = ?`);
          params.push(val.val);
        } else if (val.op === 'neq') {
          whereClauses.push(`${key} != ?`);
          params.push(val.val);
        } else if (val.op === 'ilike' || val.op === 'like') {
          whereClauses.push(`${key} LIKE ?`);
          params.push(`%${val.val.replace(/%/g, '')}%`);
        } else if (val.op === 'gte') {
          whereClauses.push(`${key} >= ?`);
          params.push(val.val);
        } else if (val.op === 'lte') {
          whereClauses.push(`${key} <= ?`);
          params.push(val.val);
        } else if (val.op === 'in') {
          const placeholders = val.val.map(() => '?').join(',');
          whereClauses.push(`${key} IN (${placeholders})`);
          params.push(...val.val);
        }
      } else {
        whereClauses.push(`${key} = ?`);
        params.push(val);
      }
    }

    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    if (order) {
      sql += ` ORDER BY ${order.column} ${order.ascending ? 'ASC' : 'DESC'}`;
    }

    if (limit) {
      sql += ` LIMIT ${Number(limit)}`;
      if (offset) {
        sql += ` OFFSET ${Number(offset)}`;
      }
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    // Parse JSON fields if necessary
    return rows.map(r => this.parseRow(r));
  }

  parseRow(row) {
    if (!row) return row;
    const parsed = { ...row };
    for (const key of ['signos_vitales', 'examenes_indicados', 'medicamentos_recetados']) {
      if (typeof parsed[key] === 'string' && (parsed[key].startsWith('[') || parsed[key].startsWith('{'))) {
        try {
          parsed[key] = JSON.parse(parsed[key]);
        } catch {
          // keep as string
        }
      }
    }
    return parsed;
  }

  getTableColumns(table) {
    if (!this._tableColumns) this._tableColumns = {};
    if (!this._tableColumns[table]) {
      try {
        const rows = this.db.prepare(`PRAGMA table_info(${table})`).all();
        if (rows && rows.length > 0) {
          this._tableColumns[table] = new Set(rows.map(r => r.name));
        }
      } catch (err) {
        console.warn(`[LocalDB] Could not get schema for ${table}:`, err);
        return null;
      }
    }
    return this._tableColumns[table];
  }

  filterValidColumns(table, item) {
    if (!item || typeof item !== 'object') return item;
    const validCols = this.getTableColumns(table);
    if (!validCols) return item;
    const filtered = {};
    for (const [k, v] of Object.entries(item)) {
      if (validCols.has(k)) {
        filtered[k] = v;
      }
    }
    return filtered;
  }

  insert(table, data) {
    const rawRecords = Array.isArray(data) ? data : [data];
    const records = rawRecords.map(r => this.filterValidColumns(table, r));
    const results = [];
    if (records.length === 0) return Array.isArray(data) ? [] : null;

    const useTx = records.length > 1;
    if (useTx) this.db.exec('BEGIN TRANSACTION');

    try {
      for (const item of records) {
        const keys = Object.keys(item);
        if (keys.length === 0) continue;
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map(k => {
          const val = item[k];
          if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
          }
          return val;
        });

        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const stmt = this.db.prepare(sql);
        const info = stmt.run(...values);

        let createdRecord = { ...item };
        if (info.lastInsertRowid && !item.id) {
          createdRecord.id = Number(info.lastInsertRowid);
        }
        results.push(this.parseRow(createdRecord));
      }
      if (useTx) this.db.exec('COMMIT');
    } catch (err) {
      if (useTx) this.db.exec('ROLLBACK');
      throw err;
    }

    return Array.isArray(data) ? results : results[0];
  }

  upsert(table, data, conflictKey = 'id') {
    const rawRecords = Array.isArray(data) ? data : [data];
    const records = rawRecords.map(r => this.filterValidColumns(table, r));
    const results = [];
    if (records.length === 0) return Array.isArray(data) ? [] : null;

    let actualConflictKey = conflictKey;
    if (table === 'pacientes') actualConflictKey = 'cedula';
    if (table === 'tarifas_seguro') actualConflictKey = 'seguro';

    const useTx = records.length > 1;
    if (useTx) this.db.exec('BEGIN TRANSACTION');

    try {
      for (const item of records) {
        const keys = Object.keys(item);
        if (keys.length === 0) continue;
        const placeholders = keys.map(() => '?').join(', ');
        const updateClauses = keys
          .filter(k => k !== actualConflictKey)
          .map(k => `${k} = excluded.${k}`)
          .join(', ');

        const values = keys.map(k => {
          const val = item[k];
          if (typeof val === 'object' && val !== null) {
            return JSON.stringify(val);
          }
          return val;
        });

        const sql = updateClauses.length > 0
          ? `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${actualConflictKey}) DO UPDATE SET ${updateClauses}`
          : `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${actualConflictKey}) DO NOTHING`;

        const stmt = this.db.prepare(sql);
        stmt.run(...values);
        results.push(this.parseRow(item));
      }
      if (useTx) this.db.exec('COMMIT');
    } catch (err) {
      if (useTx) this.db.exec('ROLLBACK');
      throw err;
    }

    return Array.isArray(data) ? results : results[0];
  }

  update(table, data, filters = {}) {
    const cleanData = this.filterValidColumns(table, data);
    const keys = Object.keys(cleanData);
    if (keys.length === 0) return this.select(table, { filters });

    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    const params = keys.map(k => {
      const val = cleanData[k];
      if (typeof val === 'object' && val !== null) {
        return JSON.stringify(val);
      }
      return val;
    });

    const whereClauses = [];
    for (const [key, val] of Object.entries(filters)) {
      if (val === null || val === undefined) continue;
      whereClauses.push(`${key} = ?`);
      params.push(val);
    }

    let sql = `UPDATE ${table} SET ${setClauses}`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const stmt = this.db.prepare(sql);
    stmt.run(...params);
    return this.select(table, { filters });
  }

  delete(table, filters = {}) {
    const params = [];
    const whereClauses = [];

    for (const [key, val] of Object.entries(filters)) {
      if (val === null || val === undefined) continue;
      whereClauses.push(`${key} = ?`);
      params.push(val);
    }

    let sql = `DELETE FROM ${table}`;
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    const stmt = this.db.prepare(sql);
    stmt.run(...params);
    return { success: true };
  }
}

module.exports = LocalDB;
