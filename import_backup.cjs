const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');

const supabase = createClient('https://bapismzckjpyqqmyfvdn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcGlzbXpja2pweXFxbXlmdmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDY1NjgsImV4cCI6MjEwMjIyMjU2OH0.AJD4ZWuFNqsNMODchdw9iJvoulMYQ66HFWtZUajWD-4');

const formatExcelDate = (val) => {
    if (!val) return null;
    if (val instanceof Date) {
        if (isNaN(val.getTime())) return null;
        return val.toISOString().split('T')[0];
    }
    if (typeof val === 'number') {
        const date = new Date(Math.round((val - 25569) * 86400 * 1000));
        if (isNaN(date.getTime())) return null;
        return date.toISOString().split('T')[0];
    }
    const strVal = String(val).trim();
    if (!strVal) return null;
    const parsedDate = new Date(strVal);
    if (!isNaN(parsedDate.getTime())) {
        return parsedDate.toISOString().split('T')[0];
    }
    return null;
};

const cleanStr = (val) => (val === '' || val === undefined || val === null) ? null : val;

async function run() {
    console.log("Cleaning up existing patients...");
    const { error: delError } = await supabase.from('pacientes').delete().not('cedula', 'eq', 'impossible_value_123');
    if (delError) {
        console.error("Error clearing table:", delError);
        return;
    }

    console.log("Loading Excel file...");
    const workbook = XLSX.readFile('backup.xlsx');
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    console.log("Parsing rows...");
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const pacientes = [];
    
    for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const nombre = String(row[0] || '').trim(); // 1-Nombre celda A
        const primerApellido = String(row[1] || '').trim(); // 2-Primer apellido celda B
        const segundoApellido = String(row[2] || '').trim(); // 3-Segundo apellido celda C
        
        // Skip header rows scattered in the file
        if (nombre.toUpperCase() === 'NOMBRE' || nombre.toUpperCase() === 'NOMBRES') {
            continue;
        }

        const fechaNacimientoRaw = row[3]; // 4-fecha de nacimiento celda D
        const edadRaw = parseInt(String(row[4] || '0').trim(), 10); // 5-Edad celda E
        const edad = isNaN(edadRaw) ? 0 : edadRaw;
        const direccion = String(row[8] || '').trim(); // 6-Direccion celda I
        const telefono = String(row[12] || '').trim(); // 7-Numero de telefono celda M
        
        let sexoRaw = String(row[21] || 'M').trim().toUpperCase(); // 8-Sexo celda V
        const sexo = (sexoRaw === 'M' || sexoRaw === 'F') ? sexoRaw : 'M';
        
        const historialClinico = String(row[41] || '').trim(); // 9-Historial clinico celda AP

        const nombreCompleto = `${nombre} ${primerApellido} ${segundoApellido}`.replace(/\s+/g, ' ').trim();

        if (!nombreCompleto) continue;

        // Same cedula logic as configuracion.page.ts
        const cedulaGenerada = `IMP-${Date.now().toString().slice(-6)}-${i}`;
        const fecha_nacimiento = formatExcelDate(fechaNacimientoRaw);
        
        pacientes.push({
            cedula: cedulaGenerada,
            nombre: nombreCompleto,
            edad: edad,
            fecha_nacimiento: fecha_nacimiento,
            profesion: null,
            seguro: 'Particular',
            sexo: sexo,
            telefono: cleanStr(telefono),
            email: null,
            altura: null,
            peso: null,
            carnet_seguro: null,
            antecedentes_personales: cleanStr(historialClinico),
            antecedentes_familiares: null,
            alergias: null,
            tipo_sangre: null,
            foto_url: null,
            direccion: cleanStr(direccion)
        });
    }

    console.log(`Found ${pacientes.length} patients to import.`);
    if (pacientes.length === 0) {
        console.log("No valid patients found.");
        return;
    }
    
    // Batch insert
    const BATCH_SIZE = 500;
    let totalInserted = 0;
    
    for (let i = 0; i < pacientes.length; i += BATCH_SIZE) {
        const batch = pacientes.slice(i, i + BATCH_SIZE);
        console.log(`Inserting batch ${Math.floor(i/BATCH_SIZE) + 1} of ${Math.ceil(pacientes.length/BATCH_SIZE)} (${batch.length} items)...`);
        
        const { error } = await supabase.from('pacientes').insert(batch);
        
        if (error) {
            console.error("Error inserting batch:", error);
            // Don't stop immediately if it's just one bad batch, but maybe we should
            return;
        }
        totalInserted += batch.length;
    }
    
    console.log(`Import completed successfully! Total inserted: ${totalInserted}`);
}

run();
