const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://bapismzckjpyqqmyfvdn.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcGlzbXpja2pweXFxbXlmdmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDY1NjgsImV4cCI6MjEwMjIyMjU2OH0.AJD4ZWuFNqsNMODchdw9iJvoulMYQ66HFWtZUajWD-4');

async function test() {
  const { data, error } = await supabase.from('signos_vitales').select('*').limit(5);
  console.log('Error:', error);
  console.log('Data:', data);
}

test();
