const { createClient } = require('@supabase/supabase-js');

const supabase = createClient('https://fikepqdxedamhplclgyx.supabase.co', 'sb_publishable_gvhFnNO89Lk3yGQYMDd8bg_QuwLwvOh');

async function test() {
  const { data, error } = await supabase.from('signos_vitales').select('*').limit(5);
  console.log('Error:', error);
  console.log('Data:', data);
}

test();
