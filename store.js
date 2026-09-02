let client;
let ordersChannel;
let suppressAuthEvents = false;

function clearPersistedAuthSession() {
  try {
    for (const storage of [window.localStorage, window.sessionStorage]) {
      for (let i = storage.length - 1; i >= 0; i -= 1) {
        const key = storage.key(i);
        if (key && key.startsWith('sb-') && key.includes('-auth-token')) storage.removeItem(key);
      }
    }
  } catch {}
}

function isJwtFutureError(error) { return error?.code === 'PGRST303' || /JWT issued at future/i.test(error?.message || ''); }
function decodeJwtPayload(token) {
  try {
    const part = token?.split('.')?.[1]; if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(atob(normalized).split('').map(c => `%${(`00${c.charCodeAt(0).toString(16)}`).slice(-2)}`).join('')));
  } catch { return null; }
}
function tokenIsFromFuture(session) { const iat = Number(decodeJwtPayload(session?.access_token)?.iat || 0); return iat > Math.floor(Date.now() / 1000) + 30; }
async function resetLocalAuth(supabase) { try { await supabase.auth.signOut({ scope: 'local' }); } catch {} clearPersistedAuthSession(); }
async function getFreshAnonymousSession(supabase) {
  await resetLocalAuth(supabase);
  const response = await supabase.auth.signInAnonymously();
  if (response.error) throw response.error;
  const session = response.data?.session || null;
  if (!session || tokenIsFromFuture(session)) { await resetLocalAuth(supabase); throw new Error('Supabase entregó un JWT con fecha futura. La sesión no puede utilizarse todavía.'); }
  return session;
}
async function getClient() {
  if (client) return client;
  let config;
  try { config = (await import('./config.local.js')).default; } catch { throw new Error('Falta config.local.js. Copia config.example.js y agrega la URL y clave publicable.'); }
  if (!config?.url || !config?.publishableKey || config.url.includes('TU-PROYECTO')) throw new Error('La configuración de Supabase no es válida.');
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  client = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return client;
}
const result = ({ data, error }) => { if (error) throw error; return data; };
const normalizeIdentity = value => {
  const identity = Array.isArray(value) ? value[0] : value;
  if (!identity || typeof identity !== 'object') return null;
  return { ...identity, user_id: identity.user_id ?? identity.id, role: identity.role ?? identity.user_role, active: identity.active === true };
};

export async function createStore({ onOrdersChange, onAuthChange }) {
  const supabase = await getClient();
  supabase.auth.onAuthStateChange((_event, authSession) => { if (!suppressAuthEvents && onAuthChange) onAuthChange(authSession); });
  const callWithFreshSession = async operation => {
    try { return await operation(); }
    catch (error) {
      if (!isJwtFutureError(error)) throw error;
      const fresh = await getFreshAnonymousSession(supabase);
      if (onAuthChange) onAuthChange(fresh);
      return await operation();
    }
  };
  return {
    mode: 'Supabase · tiempo real',
    getSession: async () => {
      const response = await supabase.auth.getSession();
      if (response?.error) { if (isJwtFutureError(response.error)) { await resetLocalAuth(supabase); return { session: null }; } throw response.error; }
      if (tokenIsFromFuture(response?.data?.session)) { await resetLocalAuth(supabase); return { session: null }; }
      return response.data;
    },
    signInAnonymously: async () => { suppressAuthEvents = true; try { return { session: await getFreshAnonymousSession(supabase) }; } finally { suppressAuthEvents = false; } },
    signIn: async () => { suppressAuthEvents = true; try { return { session: await getFreshAnonymousSession(supabase) }; } finally { suppressAuthEvents = false; } },
    signOut: async () => { await resetLocalAuth(supabase); return null; },
    claimDeviceRole: async (role, displayName) => {
      return callWithFreshSession(async () => {
        const data = result(await supabase.rpc('claim_device_role', { p_role: role, p_display_name: displayName }));
        const identity = normalizeIdentity(result(await supabase.rpc('staff_get_identity')));
        if (!identity?.user_id || identity.role !== role || identity.active !== true) {
          throw new Error(`Supabase no confirmó la asignación del área ${role}.`);
        }
        return data;
      });
    },
    getIdentity: async () => normalizeIdentity(await callWithFreshSession(() => result(supabase.rpc('staff_get_identity')))),
    getRoles: async () => {
      const identity = await callWithFreshSession(() => result(supabase.rpc('staff_get_identity')));
      const normalized = normalizeIdentity(identity);
      return normalized?.role ? [{ role: normalized.role }] : [];
    },
    getProfile: async id => {
      if (!id) return null;
      const identity = normalizeIdentity(await callWithFreshSession(() => result(supabase.rpc('staff_get_identity'))));
      if (!identity?.user_id || identity.user_id !== id) return null;
      return { display_name: identity.display_name, active: identity.active };
    },
    loadCatalog: async () => callWithFreshSession(async () => {
      const catalog = result(await supabase.rpc('staff_load_catalog'));
      return { products: (catalog?.products || []).map(p => ({ ...p, categories: p.category_code || p.category_name ? { code: p.category_code, name: p.category_name } : null })), categories: catalog?.categories || [], payments: catalog?.payments || [] };
    }),
    listOrders: async () => callWithFreshSession(() => result(supabase.from('orders').select('id, order_number, status, total, notes, payment_type, cash_received, change_due, created_at, updated_at, order_items(id, product_name, unit_price, quantity, line_total)').order('created_at', { ascending: false }))),
    createOrder: async ({ items, paymentMethodCode, notes, cashReceived }) => callWithFreshSession(() => result(supabase.rpc('create_order', { p_items: items.map(({ id, quantity }) => ({ product_id: id, quantity })), p_payment_method_code: paymentMethodCode, p_notes: notes || null, p_cash_received: paymentMethodCode === 'cash' ? Number(cashReceived || 0) : null }))),
    updateOrderStatus: async (id, status) => callWithFreshSession(() => result(supabase.rpc('update_order_status', { p_order_id: id, p_status_code: status }))),
    closeCash: async (notes = '') => callWithFreshSession(() => result(supabase.rpc('close_cash_register', { p_business_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }), p_notes: notes || null }))),
    subscribeToOrders: async () => {
      if (ordersChannel) await supabase.removeChannel(ordersChannel);
      ordersChannel = supabase.channel('coco-loco-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onOrdersChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onOrdersChange)
        .subscribe(status => {
          if (status === 'SUBSCRIBED') return;
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onOrdersChange?.({ realtimeError: status });
        });
    },
    unsubscribe: async () => { if (ordersChannel) { await supabase.removeChannel(ordersChannel); ordersChannel = undefined; } },
  };
}
