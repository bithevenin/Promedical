const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fikepqdxedamhplclgyx.supabase.co';
const supabaseKey = 'sb_publishable_gvhFnNO89Lk3yGQYMDd8bg_QuwLwvOh';

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
