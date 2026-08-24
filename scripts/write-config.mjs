import { writeFileSync } from 'node:fs';

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || '';

if (!url || !key) {
  console.error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const safe = value => JSON.stringify(value);
writeFileSync(
  'config.local.js',
  `export default { url: ${safe(url)}, publishableKey: ${safe(key)} };\n`,
  'utf8'
);
console.log('Generated config.local.js with the public Supabase configuration.');
