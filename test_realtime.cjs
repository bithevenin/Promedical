const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bapismzckjpyqqmyfvdn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJhcGlzbXpja2pweXFxbXlmdmRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY2NDY1NjgsImV4cCI6MjEwMjIyMjU2OH0.AJD4ZWuFNqsNMODchdw9iJvoulMYQ66HFWtZUajWD-4';

const supabase = createClient(supabaseUrl, supabaseKey);

console.log('Connecting to realtime...');
const channel = supabase
  .channel('test-citas')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'citas' },
    (payload) => {
      console.log('CHANGE DETECTED:', payload);
    }
  )
  .subscribe((status, err) => {
    console.log('Subscription Status:', status);
    if (err) {
      console.error('Subscription Error:', err);
    }
  });

// Wait 30 seconds to receive any update
setTimeout(() => {
  console.log('Timeout reached. Exiting.');
  process.exit(0), 30000;
}, 30000);
