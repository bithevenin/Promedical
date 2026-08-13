const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bapismzckjpyqqmyfvdn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcGlzbXpja2pweXFxbXlmdmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDY1NjgsImV4cCI6MjEwMjIyMjU2OH0.AJD4ZWuFNqsNMODchdw9iJvoulMYQ66HFWtZUajWD-4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function trigger() {
  console.log('Inserting dummy cita to trigger realtime...');
  const { data, error } = await supabase.from('citas').insert([
    {
      turno: 999,
      nombre: 'Dummy Realtime Test',
      cedula: '000-0000000-0',
      edad: 99,
      seguro: 'Particular',
      sexo: 'M',
      fecha: '2026-06-05',
      estado: 'espera',
      hora: '12:00'
    }
  ]).select();

  if (error) {
    console.error('Insert Error:', error);
  } else {
    console.log('Inserted successfully:', data);
    // Wait 5 seconds and delete it
    setTimeout(async () => {
      console.log('Deleting dummy cita...');
      await supabase.from('citas').delete().eq('id', data[0].id);
      console.log('Deleted successfully.');
      process.exit(0);
    }, 5000);
  }
}

trigger().catch(console.error);
