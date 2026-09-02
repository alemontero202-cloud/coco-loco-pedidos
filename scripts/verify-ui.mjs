import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf8');
const js = readFileSync('app.js', 'utf8');
const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(m => m[1]));
const selectors = [...js.matchAll(/\$\(['"]#([^'"]+)["']\)/g)].map(m => m[1]);
const missing = [...new Set(selectors)].filter(id => !ids.has(id));
if (missing.length) {
  console.error(`Selectores sin elemento HTML: ${missing.join(', ')}`);
  process.exit(1);
}
for (const required of ['enter-cashier','enter-kitchen','sign-out','category-tabs','product-search','product-list','open-cart','cart-dialog','receipt-dialog','close-receipt','whatsapp-receipt','close-cash']) {
  if (!ids.has(required)) {
    console.error(`Elemento requerido ausente: #${required}`);
    process.exit(1);
  }
}
console.log(`UI selector check OK (${selectors.length} selectors comprobados).`);
