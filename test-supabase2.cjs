const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://bapismzckjpyqqmyfvdn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcGlzbXpja2pweXFxbXlmdmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDY1NjgsImV4cCI6MjEwMjIyMjU2OH0.AJD4ZWuFNqsNMODchdw9iJvoulMYQ66HFWtZUajWD-4');

async function test() {
  const { data, error } = await supabase.from('signos_vitales').insert({
    paciente_cedula: '12345678901',
    fecha: '2026-08-06',
    presion_arterial: '120/80',
    frecuencia_cardiaca: 80,
    temperatura: 37,
    peso: 70,
    talla: 170,
    imc: 24,
    non_existent_column_123: 1
  });
  console.log('Error:', error);
}

test();
