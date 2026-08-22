let client;
let ordersChannel;

async function getClient() {
  if (client) return client;
  let config;
  try { config = (await import('./config.local.js')).default; }
  catch { throw new Error('Falta config.local.js. Copia config.example.js y agrega la URL y clave publicable.'); }
  if (!config?.url || !config?.publishableKey || config.url.includes('TU-PROYECTO')) throw new Error('La configuración de Supabase no es válida.');
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  client = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
const result = ({ data, error }) => { if (error) throw error; return data; };

export async function createStore({ onOrdersChange, onAuthChange }) {
  const supabase = await getClient();
  supabase.auth.onAuthStateChange((_event, session) => onAuthChange(session));
  return {
    mode: 'Supabase · en tiempo real',
    getSession: async () => result(await supabase.auth.getSession()),
    signIn: async (email, password) => result(await supabase.auth.signInWithPassword({ email, password })),
    signOut: async () => result(await supabase.auth.signOut()),
    getRoles: async () => result(await supabase.from('user_roles').select('role').eq('active', true)),
    getProfile: async id => result(await supabase.from('profiles').select('display_name, active').eq('id', id).single()),
    loadCatalog: async () => {
      const [products, categories, payments] = await Promise.all([
        supabase.from('products').select('id, name, price, description, category, category_id, categories(name, code)').eq('active', true).order('sort_order').order('name'),
        supabase.from('categories').select('id, name, code').eq('active', true).order('sort_order').order('name'),
        supabase.from('payment_methods').select('code, name').eq('active', true).order('sort_order'),
      ]);
      return { products: result(products), categories: result(categories), payments: result(payments) };
    },
    listOrders: async () => result(await supabase.from('orders').select('id, order_number, status, total, notes, payment_type, cash_received, change_due, created_at, updated_at, order_items(id, product_name, unit_price, quantity, line_total)').order('created_at', { ascending: false })),
    createOrder: async ({ items, paymentMethodCode, notes, cashReceived }) => result(await supabase.rpc('create_order', {
      p_items: items.map(({ id, quantity }) => ({ product_id: id, quantity })), p_payment_method_code: paymentMethodCode, p_notes: notes || null,
      p_cash_received: paymentMethodCode === 'cash' ? cashReceived : null,
    })),
    updateOrderStatus: async (id, status) => result(await supabase.rpc('update_order_status', { p_order_id: id, p_status_code: status })),
    subscribeToOrders: async () => {
      if (ordersChannel) await supabase.removeChannel(ordersChannel);
      ordersChannel = supabase.channel('coco-loco-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onOrdersChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onOrdersChange).subscribe();
    },
    unsubscribe: async () => { if (ordersChannel) await supabase.removeChannel(ordersChannel); ordersChannel = undefined; },
  };
}
