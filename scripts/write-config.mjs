import { writeFileSync } from 'node:fs';

// These are public client-side Supabase values. They are intentionally used as
// build defaults so the APK can be compiled without GitHub secrets.
const url = process.env.SUPABASE_URL || 'https://lycbjfjcjelbgsyljbja.supabase.co';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_wM7irVIPy5TyJ_zmCEL33A_cocdZoLr';

if (!url || !key) {
  console.error('Missing Supabase public configuration');
  process.exit(1);
}

const safe = value => JSON.stringify(value);
writeFileSync(
  'config.local.js',
  `export default { url: ${safe(url)}, publishableKey: ${safe(key)} };\n`,
  'utf8'
);
console.log('Generated config.local.js with the public Supabase configuration.');
