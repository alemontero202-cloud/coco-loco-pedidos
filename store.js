let client;
let ordersChannel;

async function getClient() {
  if (client) return client;

  let config;

  try {
    config = (await import('./config.local.js')).default;
  } catch {
    throw new Error(
      'Falta config.local.js. Copia config.example.js y agrega la URL y clave publicable.'
    );
  }

  if (!config?.url || !config?.publishableKey || config.url.includes('TU-PROYECTO')) {
    throw new Error('La configuración de Supabase no es válida.');
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

  client = createClient(config.url, config.publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return client;
}

const result = ({ data, error }) => {
  if (error) throw error;
  return data;
};

export async function createStore({ onOrdersChange, onAuthChange }) {
  const supabase = await getClient();

  supabase.auth.onAuthStateChange((_event, authSession) => {
    if (onAuthChange) onAuthChange(authSession);
  });

  return {
    mode: 'Supabase · tiempo real',

    getSession: async () => result(await supabase.auth.getSession()),

    signInAnonymously: async () => result(await supabase.auth.signInAnonymously()),

    signIn: async () => result(await supabase.auth.signInAnonymously()),

    signOut: async () => result(await supabase.auth.signOut()),

    claimDeviceRole: async (role, displayName) => result(
      await supabase.rpc('claim_device_role', {
        p_role: role,
        p_display_name: displayName,
      })
    ),

    getRoles: async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const userId = sessionData.session?.user?.id;
      if (!userId) return [];

      return result(
        await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId)
          .eq('active', true)
      );
    },

    getProfile: async (id) => {
      if (!id) return null;
      const response = await supabase
        .from('profiles')
        .select('display_name, active')
        .eq('id', id)
        .maybeSingle();
      return result(response);
    },

    loadCatalog: async () => {
      const [products, categories, payments] = await Promise.all([
        supabase
          .from('products')
          .select('id, name, price, description, category, category_id, categories(name, code)')
          .eq('active', true)
          .order('sort_order')
          .order('name'),
        supabase
          .from('categories')
          .select('id, name, code')
          .eq('active', true)
          .order('sort_order')
          .order('name'),
        supabase
          .from('payment_methods')
          .select('code, name')
          .eq('active', true)
          .order('sort_order'),
      ]);

      return {
        products: result(products),
        categories: result(categories),
        payments: result(payments),
      };
    },

    listOrders: async () => result(
      await supabase
        .from('orders')
        .select('id, order_number, status, total, notes, payment_type, cash_received, change_due, created_at, updated_at, order_items(id, product_name, unit_price, quantity, line_total)')
        .order('created_at', { ascending: false })
    ),

    createOrder: async ({ items, paymentMethodCode, notes, cashReceived }) => result(
      await supabase.rpc('create_order', {
        p_items: items.map(({ id, quantity }) => ({ product_id: id, quantity })),
        p_payment_method_code: paymentMethodCode,
        p_notes: notes || null,
        p_cash_received: paymentMethodCode === 'cash' ? Number(cashReceived || 0) : null,
      })
    ),

    updateOrderStatus: async (id, status) => result(
      await supabase.rpc('update_order_status', {
        p_order_id: id,
        p_status_code: status,
      })
    ),

    closeCash: async (notes = '') => result(
      await supabase.rpc('close_cash_register', {
        p_business_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Lima' }),
        p_notes: notes || null,
      })
    ),

    subscribeToOrders: async () => {
      if (ordersChannel) await supabase.removeChannel(ordersChannel);

      ordersChannel = supabase
        .channel('coco-loco-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, onOrdersChange)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onOrdersChange)
        .subscribe();
    },

    unsubscribe: async () => {
      if (ordersChannel) {
        await supabase.removeChannel(ordersChannel);
        ordersChannel = undefined;
      }
    },
  };
}
