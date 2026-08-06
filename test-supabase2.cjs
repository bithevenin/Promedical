const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://fikepqdxedamhplclgyx.supabase.co', 'sb_publishable_gvhFnNO89Lk3yGQYMDd8bg_QuwLwvOh');

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
