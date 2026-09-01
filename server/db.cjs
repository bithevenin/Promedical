const Database = require('better-sqlite3');
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
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.initTables();
    this.seedInitialData();
  }

  initTables() {
    this.db.exec(`      CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        correo TEXT UNIQUE,
        nombre TEXT,
        rol TEXT DEFAULT 'doctor',
        especialidad TEXT,
        foto_url TEXT,
        password TEXT,
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
        receta TEXT,
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
        id TEXT PRIMARY KEY,
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
        fecha TEXT,
        concepto TEXT,
        categoria TEXT,
        monto REAL DEFAULT 0,
        paciente TEXT,
        tipo TEXT,
        metodo_pago TEXT,
        paciente_cedula TEXT,
        doctor_id TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facturas_seguro (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cedula TEXT,
        nombre_paciente TEXT,
        edad INTEGER,
        carnet_seguro TEXT,
        seguro TEXT,
        fecha TEXT,
        monto REAL DEFAULT 0,
        estado TEXT DEFAULT 'pendiente',
        fecha_pago TEXT,
        paciente_cedula TEXT,
        paciente_nombre TEXT,
        numero_reclamacion TEXT,
        ars_nombre TEXT,
        nss TEXT,
        ncf TEXT,
        monto_reclamado REAL DEFAULT 0,
        monto_cobertura REAL DEFAULT 0,
        diferencia_paciente REAL DEFAULT 0,
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
        id INTEGER PRIMARY KEY,
        nombre_doctor TEXT,
        especialidad TEXT,
        foto_url TEXT,
        monto_consulta_particular REAL DEFAULT 4000,
        exequatur TEXT,
        email TEXT,
        facturacion_json TEXT,
        certificado_json TEXT,
        password TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tarifas_seguro (
        id TEXT PRIMARY KEY,
        seguro TEXT UNIQUE,
        monto_cobertura REAL DEFAULT 750,
        copago REAL DEFAULT 3000,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Ensure backwards compatibility for existing SQLite databases
    this.migrateTarifasTable();
    this.ensureColumn('configuracion_doctor', 'facturacion_json', 'TEXT');
    this.ensureColumn('configuracion_doctor', 'certificado_json', 'TEXT');
    this.ensureColumn('configuracion_doctor', 'password', 'TEXT');
    this.ensureColumn('usuarios', 'password', 'TEXT');
    this.ensureColumn('consultas', 'receta', 'TEXT');
    this.ensureColumn('transacciones', 'paciente', 'TEXT');
    this.ensureColumn('facturas_seguro', 'cedula', 'TEXT');
    this.ensureColumn('facturas_seguro', 'nombre_paciente', 'TEXT');
    this.ensureColumn('facturas_seguro', 'edad', 'INTEGER');
    this.ensureColumn('facturas_seguro', 'carnet_seguro', 'TEXT');
    this.ensureColumn('facturas_seguro', 'seguro', 'TEXT');
    this.ensureColumn('facturas_seguro', 'monto', 'REAL DEFAULT 0');

    // Fast Query Indexes
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pacientes_nombre ON pacientes(nombre);
      CREATE INDEX IF NOT EXISTS idx_consultas_paciente ON consultas(paciente_cedula);
      CREATE INDEX IF NOT EXISTS idx_citas_fecha ON citas(fecha);
      CREATE INDEX IF NOT EXISTS idx_citas_turno ON citas(turno);
      CREATE INDEX IF NOT EXISTS idx_citas_cedula ON citas(cedula);
      CREATE INDEX IF NOT EXISTS idx_signos_paciente ON signos_vitales(paciente_cedula);
      CREATE INDEX IF NOT EXISTS idx_transacciones_fecha ON transacciones(fecha);
      CREATE INDEX IF NOT EXISTS idx_facturas_cedula ON facturas_seguro(cedula);
    `);
  }

  migrateTarifasTable() {
    try {
      const cols = this.db.prepare("PRAGMA table_info(tarifas_seguro)").all();
      const idCol = cols && cols.find(c => c.name === 'id');
      if (idCol && idCol.type && idCol.type.toUpperCase() === 'INTEGER') {
        this.db.exec(`
          DROP TABLE IF EXISTS tarifas_seguro;
          CREATE TABLE tarifas_seguro (
            id TEXT PRIMARY KEY,
            seguro TEXT UNIQUE,
            monto_cobertura REAL DEFAULT 750,
            copago REAL DEFAULT 3000,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
          );
        `);
      }
    } catch (e) {
      console.warn('[LocalDB] migrateTarifasTable error:', e);
    }
  }

  ensureColumn(table, colName, colType) {
    try {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${colName} ${colType}`);
    } catch {
      // Column already exists, safe to ignore
    }
  }

  seedInitialData() {
    const docQuery = this.db.prepare('SELECT * FROM configuracion_doctor LIMIT 1');
    const docRow = docQuery.get();
    if (!docRow) {
      const insertDoc = this.db.prepare(`
        INSERT INTO configuracion_doctor (id, nombre_doctor, especialidad, exequatur, email, monto_consulta_particular, foto_url)
        VALUES (1, 'Dr. Thevenin', 'Urólogo', '34535', 'dr.miguelthevenin@gmail.com', 4000, 'https://i.pravatar.cc/150?u=doctor')
      `);
      insertDoc.run();
    } else if (docRow.exequatur === '12345-67' || docRow.monto_consulta_particular === 1500) {
      // Update legacy seed to match real Supabase doctor configuration
      this.db.prepare(`
        UPDATE configuracion_doctor 
        SET exequatur = '34535', email = 'dr.miguelthevenin@gmail.com', monto_consulta_particular = 4000
        WHERE id = ? OR id = 1
      `).run(docRow.id);
    }

    const tarifQuery = this.db.prepare('SELECT count(*) as count FROM tarifas_seguro');
    const tarifRow = tarifQuery.get();
    if (tarifRow && (tarifRow.count === 0 || tarifRow.count === 6)) {
      if (tarifRow.count === 6) {
        this.db.exec('DELETE FROM tarifas_seguro WHERE monto_cobertura = 500 OR monto_cobertura = 450 OR monto_cobertura = 400');
      }
      const defaultTarifas = [
        { id: 'ab975e42-92ca-46ac-9995-d1cf998b6ab8', seguro: 'ARS Humano', monto_cobertura: 750, copago: 3000 },
        { id: 'b78d3821-cbf1-48bc-aab2-64075b3e9b78', seguro: 'ARS Primera', monto_cobertura: 750, copago: 3000 },
        { id: '26b916d7-47f3-4020-ba10-c9d3042928c2', seguro: 'ARS Senasa', monto_cobertura: 750, copago: 3000 },
        { id: '2560de46-59a4-4dc7-b392-48f2c53fac92', seguro: 'ARS Mapfre', monto_cobertura: 750, copago: 3000 },
        { id: 'd2ff9b56-54d7-427d-a9b9-136fcfc38849', seguro: 'ARS Futuro', monto_cobertura: 750, copago: 3000 },
        { id: '54d8815d-49d7-4aa8-98bb-45bc09ee8cb6', seguro: 'ARS Palic', monto_cobertura: 750, copago: 3000 },
        { id: '7397ebfb-b7e4-48cb-ad52-e4d0df95fd62', seguro: 'universal', monto_cobertura: 750, copago: 3000 },
        { id: '0b030875-1491-4911-9da3-5dc00785d1d7', seguro: 'renacer', monto_cobertura: 750, copago: 3000 },
        { id: '7d84aad6-5b7f-4761-818d-76127c1632cc', seguro: 'monumental', monto_cobertura: 750, copago: 3000 }
      ];
      const insertTarifa = this.db.prepare(`
        INSERT OR REPLACE INTO tarifas_seguro (id, seguro, monto_cobertura, copago)
        VALUES (?, ?, ?, ?)
      `);
      for (const t of defaultTarifas) {
        insertTarifa.run(t.id, t.seguro, t.monto_cobertura, t.copago);
      }
    }

    const userQuery = this.db.prepare('SELECT count(*) as count FROM usuarios');
    const userRow = userQuery.get();
    if (userRow && userRow.count === 0) {
      const insertUser = this.db.prepare(`
        INSERT INTO usuarios (id, correo, nombre, rol, especialidad, password_hash)
        VALUES 
          ('c4124d50-2460-4bfb-9586-442a1f6966ef', 'brayam.alfa@gmail.com', 'Brayam Thevenin', 'doctor', 'Urólogo', '123456'),
          ('local-doc-1', 'dr.miguelthevenin@gmail.com', 'Dr. Thevenin', 'doctor', 'Urólogo', '123456'),
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

    if (limit !== null && limit !== undefined) {
      sql += ` LIMIT ${Number(limit)}`;
      if (offset !== null && offset !== undefined && Number(offset) > 0) {
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

    const doInsert = this.db.transaction((recs) => {
      for (const item of recs) {
        const keys = Object.keys(item);
        if (keys.length === 0) continue;
        const placeholders = keys.map(() => '?').join(', ');
        const values = keys.map(k => {
          const val = item[k];
          if (typeof val === 'object' && val !== null) return JSON.stringify(val);
          return val;
        });
        const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
        const info = this.db.prepare(sql).run(...values);
        let createdRecord = { ...item };
        if (info.lastInsertRowid && !item.id) {
          createdRecord.id = Number(info.lastInsertRowid);
        }
        results.push(this.parseRow(createdRecord));
      }
    });

    doInsert(records);
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

    const doUpsert = this.db.transaction((recs) => {
      for (const item of recs) {
        const keys = Object.keys(item);
        if (keys.length === 0) continue;
        const placeholders = keys.map(() => '?').join(', ');
        const updateClauses = keys
          .filter(k => k !== actualConflictKey)
          .map(k => `${k} = excluded.${k}`)
          .join(', ');
        const values = keys.map(k => {
          const val = item[k];
          if (typeof val === 'object' && val !== null) return JSON.stringify(val);
          return val;
        });
        const sql = updateClauses.length > 0
          ? `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${actualConflictKey}) DO UPDATE SET ${updateClauses}`
          : `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders}) ON CONFLICT(${actualConflictKey}) DO NOTHING`;
        this.db.prepare(sql).run(...values);
        results.push(this.parseRow(item));
      }
    });

    doUpsert(records);
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
