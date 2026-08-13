const { createClient } = require('@supabase/supabase-js');

const oldUrl = 'https://fikepqdxedamhplclgyx.supabase.co';
const oldKey = 'sb_publishable_gvhFnNO89Lk3yGQYMDd8bg_QuwLwvOh';

const newUrl = 'https://bapismzckjpyqqmyfvdn.supabase.co';
const newKey = 'sb_publishable_GegsFZOA-z32zbh0XtzSwQ_6cVwXKPI';

const oldClient = createClient(oldUrl, oldKey);
const newClient = createClient(newUrl, newKey);

async function migrateTable(tableName, idField = null) {
  console.log(`\n=== Migrando tabla '${tableName}' ===`);
  
  // Contar filas totales en la base de datos antigua
  const { count, error: countErr } = await oldClient.from(tableName).select('*', { count: 'exact', head: true });
  if (countErr) {
    console.error(`Error contando filas en '${tableName}':`, countErr.message);
    return;
  }
  
  console.log(`Total de filas a migrar en '${tableName}': ${count}`);
  if (count === 0) {
    console.log(`La tabla '${tableName}' está vacía, omitiendo.`);
    return;
  }

  const BATCH_SIZE = 500;
  let migrated = 0;

  for (let offset = 0; offset < count; offset += BATCH_SIZE) {
    const { data: rows, error: readErr } = await oldClient
      .from(tableName)
      .select('*')
      .range(offset, offset + BATCH_SIZE - 1);

    if (readErr) {
      console.error(`Error leyendo lote offset ${offset} en '${tableName}':`, readErr.message);
      break;
    }

    if (!rows || rows.length === 0) break;

    const { error: writeErr } = await newClient.from(tableName).upsert(rows);
    if (writeErr) {
      console.error(`Error escribiendo lote offset ${offset} en '${tableName}':`, writeErr.message);
      // Intentar uno por uno si falla el lote
      for (const row of rows) {
        const { error: singleErr } = await newClient.from(tableName).upsert(row);
        if (!singleErr) migrated++;
      }
    } else {
      migrated += rows.length;
      console.log(`Migradas ${migrated}/${count} filas en '${tableName}'...`);
    }
  }

  console.log(`✅ Finalizada migración de '${tableName}': ${migrated} filas migradas.`);
}

async function runMigration() {
  console.log('🚀 INICIANDO PROCESO DE MIGRACIÓN COMPLETA DE DATOS');
  console.log(`De: ${oldUrl}`);
  console.log(`A:  ${newUrl}`);

  // Migrar tablas simples en orden de dependencias
  await migrateTable('usuarios');
  await migrateTable('configuracion_doctor');
  await migrateTable('tarifas_seguro');
  await migrateTable('pacientes');
  await migrateTable('signos_vitales');
  await migrateTable('citas');
  await migrateTable('consultas');
  await migrateTable('transacciones');
  await migrateTable('facturas_seguro');
  await migrateTable('reportes_pagos_seguro');

  console.log('\n🎉 MIGRACIÓN COMPLETA FINALIZADA EXITOSAMENTE');
}

runMigration();
