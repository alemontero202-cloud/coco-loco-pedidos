import { createStore } from './store.js';

const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('es-PE', {
  style: 'currency',
  currency: 'PEN'
}).format(Number(n || 0));

const esc = v => String(v ?? '').replace(
  /[&<>'"]/g,
  c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c])
);

const labels = {
  new: 'NUEVO',
  preparing: 'PREPARANDO',
  ready: 'LISTO',
  delivered: 'ENTREGADO',
  cancelled: 'CANCELADO'
};

const next = {
  new: 'preparing',
  preparing: 'ready',
  ready: 'delivered'
};

const actions = {
  preparing: 'Preparar',
  ready: 'Marcar listo',
  delivered: 'Entregar'
};

let store;
let cart = [];
let orders = [];
let products = [];
let categories = [];
let payments = [];
let role;
let session;
let category = 'all';
let history = 'all';

const total = () =>
  cart.reduce(
    (sum, x) => sum + Number(x.price) * x.quantity,
    0
  );

const today = d =>
  new Date(d).toLocaleDateString('en-CA', {
    timeZone: 'America/Lima'
  }) ===
  new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Lima'
  });

const cashier = () =>
  ['admin', 'manager', 'cashier'].includes(role);

const kitchen = () =>
  ['admin', 'manager', 'kitchen'].includes(role);

function toast(message) {
  const t = $('#toast');
  if (!t) return;

  t.textContent = message;
  t.classList.add('show');

  setTimeout(
    () => t.classList.remove('show'),
    3000
  );
}

const categoryCode = p =>
  p.categories?.code ||
  p.category_id ||
  p.category ||
  'other';

const categoryName = p =>
  p.categories?.name ||
  p.category ||
  'Sin categoría';

function renderCatalog() {
  const search = $('#product-search');

  if (!search) return;

  const q = search.value.toLowerCase().trim();

  $('#category-tabs').innerHTML = [
    { code: 'all', name: 'Todos' },
    ...categories
  ]
    .map(
      c => `
        <button
          class="category ${category === c.code ? 'is-selected' : ''}"
          data-category="${esc(c.code)}">
          ${esc(c.name)}
        </button>
      `
    )
    .join('');

  const list = products.filter(
    p =>
      (category === 'all' ||
        categoryCode(p) === category) &&
      `${p.name} ${p.description || ''} ${categoryName(p)}`
        .toLowerCase()
        .includes(q)
  );

  $('#product-list').innerHTML = list.length
    ? list
        .map(
          p => `
            <article class="product">
              <span class="product-icon">
                ${categoryName(p) === 'Bebidas' ? '◉' : '♨'}
              </span>

              <div>
                <strong>${esc(p.name)}</strong>
                <small>
                  ${esc(
                    p.description ||
                    categoryName(p)
                  )}
                </small>
              </div>

              <button
                class="add-product"
                data-id="${p.id}">
                <span>${money(p.price)}</span>
                <b>+</b>
              </button>
            </article>
          `
        )
        .join('')
    : '<p class="empty">No encontramos productos.</p>';
}

function renderPayments() {
  const select = $('#payment-method');

  if (!select) return;

  select.innerHTML = payments
    .map(
      p =>
        `<option value="${esc(p.code)}">
          ${esc(p.name)}
        </option>`
    )
    .join('');

  toggleCash();
}

function renderChange() {
  const received = Number(
    $('#cash-received')?.value || 0
  );

  const change = received - total();

  $('#change-amount').textContent =
    money(Math.max(change, 0));

  $('#change-row').classList.toggle(
    'negative',
    change < 0
  );
}

function renderCart() {
  const count = cart.reduce(
    (sum, x) => sum + x.quantity,
    0
  );

  $('#cart-count').textContent =
    `${count} ${count === 1 ? 'producto' : 'productos'}`;

  $('#cart-total').textContent =
    money(total());

  $('#dialog-total').textContent =
    money(total());

  $('#open-cart').disabled =
    !cart.length;

  $('#cart-items').innerHTML =
    cart.length
      ? cart
          .map(
            x => `
              <div class="cart-line">

                <div>
                  <strong>${esc(x.name)}</strong>
                  <small>
                    ${esc(
                      x.description ||
                      categoryName(x)
                    )}
                  </small>
                </div>

                <div class="quantity">
                  <button
                    data-action="less"
                    data-id="${x.id}">
                    −
                  </button>

                  <b>${x.quantity}</b>

                  <button
                    data-action="more"
                    data-id="${x.id}">
                    +
                  </button>
                </div>

                <strong>
                  ${money(
                    Number(x.price) *
                    x.quantity
                  )}
                </strong>

              </div>
            `
          )
          .join('')
      : '<p class="empty">Tu pedido está vacío.</p>';

  renderChange();
}

function add(id) {
  const p = products.find(
    x => x.id === id
  );

  const line = cart.find(
    x => x.id === id
  );

  if (!p) return;

  if (line) {
    line.quantity++;
  } else {
    cart.push({
      ...p,
      quantity: 1
    });
  }

  renderCart();
}

function card(o, forKitchen = false) {
  const status =
    labels[o.status] || o.status;

  const lines =
    o.order_items || [];

  const time =
    new Date(
      o.created_at
    ).toLocaleTimeString(
      'es-PE',
      {
        hour: '2-digit',
        minute: '2-digit'
      }
    );

  const target =
    next[o.status];

  return `
    <article class="order-card">

      <div class="order-card__head">

        <div>
          <span class="order-number">
            #${String(
              o.order_number
            ).padStart(3, '0')}
          </span>

          <small>${time}</small>
        </div>

        <span
          class="status status--${esc(
            o.status
          )}">
          ${esc(status)}
        </span>

      </div>

      <p class="order-lines">
        ${lines
          .map(
            x =>
              `${x.quantity}× ${esc(
                x.product_name
              )}`
          )
          .join('<br>')}
      </p>

      ${
        o.notes
          ? `<p class="note">${esc(
              o.notes
            )}</p>`
          : ''
      }

      <div class="order-card__foot">

        <strong>
          ${money(o.total)}
        </strong>

        ${
          forKitchen && target
            ? `
              <button
                class="status-button"
                data-order="${o.id}"
                data-next="${target}">
                ${actions[target]}
              </button>
            `
            : `
              <span>
                ${esc(
                  payments.find(
                    x =>
                      x.code ===
                      o.payment_type
                  )?.name ||
                    o.payment_type ||
                    ''
                )}
              </span>
            `
        }

      </div>

    </article>
  `;
}

function renderKitchen() {
  const active =
    orders.filter(
      o =>
        ![
          'delivered',
          'cancelled'
        ].includes(o.status)
    );

  $('#kitchen-summary').innerHTML =
    ['new', 'preparing', 'ready']
      .map(
        s =>
          `<span>
            <b>
              ${active.filter(
                o =>
                  o.status === s
              ).length}
            </b>
            ${labels[s]}
          </span>`
      )
      .join('');

  $('#kitchen-list').innerHTML =
    active.length
      ? active
          .map(o => card(o, true))
          .join('')
      : '<p class="empty">No hay pedidos pendientes.</p>';
}

function renderHistory() {
  const visible =
    orders.filter(
      o =>
        history === 'all' ||
        (
          history === 'pending' &&
          ![
            'delivered',
            'cancelled'
          ].includes(o.status)
        ) ||
        o.status === history
    );

  $('#history-list').innerHTML =
    visible.length
      ? visible
          .map(o => card(o))
          .join('')
      : '<p class="empty">No hay pedidos para mostrar.</p>';
}

function renderSales() {
  const daily =
    orders.filter(o =>
      today(o.created_at)
    );

  const done =
    daily.filter(
      o => o.status === 'delivered'
    );

  const amount =
    done.reduce(
      (s, o) =>
        s + Number(o.total),
      0
    );

  $('#sales-total').textContent =
    money(amount);

  $('#sales-count').textContent =
    `${daily.length} pedidos registrados`;

  $('#sales-cards').innerHTML =
    payments
      .map(
        p => `
          <div>
            <span>${esc(p.name)}</span>
            <b>
              ${money(
                done
                  .filter(
                    o =>
                      o.payment_type ===
                      p.code
                  )
                  .reduce(
                    (s, o) =>
                      s +
                      Number(o.total),
                    0
                  )
              )}
            </b>
          </div>
        `
      )
      .join('');

  const counts = {};

  done.forEach(o =>
    (o.order_items || [])
      .forEach(x => {
        counts[x.product_name] =
          (counts[x.product_name] || 0) +
          x.quantity;
      })
  );

  $('#top-products').innerHTML =
    Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(
        ([name, quantity]) =>
          `<p>
            <span>${esc(name)}</span>
            <b>${quantity}</b>
          </p>`
      )
      .join('') ||
    '<p class="empty">Aún no hay ventas entregadas.</p>';
}

async function refresh() {
  if (!session) return;

  try {
    orders =
      await store.listOrders();

    renderKitchen();
    renderHistory();
    renderSales();

  } catch (error) {
    toast(
      `No se pudieron cargar pedidos: ${error.message}`
    );
  }
}

function toggleCash() {
  const show =
    $('#payment-method')?.value ===
    'cash';

  $('#cash-field').hidden =
    !show;

  $('#change-row').hidden =
    !show;
}

async function place(event) {
  event.preventDefault();

  if (!cart.length) {
    return toast(
      'Agrega al menos un producto.'
    );
  }

  const payment =
    $('#payment-method').value;

  const received =
    Number(
      $('#cash-received').value || 0
    );

  if (
    payment === 'cash' &&
    received < total()
  ) {
    return toast(
      `Faltan ${money(
        total() - received
      )} para completar el pago.`
    );
  }

  const button =
    $('#place-order');

  button.disabled = true;

  try {
    const saved =
      await store.createOrder({
        items: cart,
        paymentMethodCode: payment,
        notes:
          $('#order-note').value.trim(),
        cashReceived: received
      });

    cart = [];

    $('#cart-dialog').close();

    $('#cash-received').value = '';

    $('#order-note').value = '';

    renderCart();

    await refresh();

    toast(
      `Pedido #${String(
        saved.order_number
      ).padStart(3, '0')} registrado.`
    );

  } catch (error) {
    toast(
      `No se pudo registrar el pedido: ${error.message}`
    );
  } finally {
    button.disabled = false;
  }
}

function view(id) {
  document
    .querySelectorAll('.view')
    .forEach(v =>
      v.classList.toggle(
        'is-active',
        v.id === id
      )
    );

  document
    .querySelectorAll('.nav-item')
    .forEach(n =>
      n.classList.toggle(
        'is-active',
        n.dataset.view === id
      )
    );

  scrollTo(0, 0);
}

function applyRole() {
  document
    .querySelectorAll(
      '[data-requires="cashier"]'
    )
    .forEach(
      x =>
        (x.hidden = !cashier())
    );

  document
    .querySelectorAll(
      '[data-requires="kitchen"]'
    )
    .forEach(
      x =>
        (x.hidden = !kitchen())
    );

  if (!cashier() && kitchen()) {
    view('kitchen-view');
  }
}

/*
 * Entrada de la aplicación.
 *
 * No se solicita correo ni contraseña.
 * El usuario elige CAJA o COCINA.
 */
async function enterAs(selectedRole) {
  try {
    $('#role-error').textContent = '';

    const button =
      selectedRole === 'cashier'
        ? $('#enter-cashier')
        : $('#enter-kitchen');

    button.disabled = true;

    await store.signInAnonymously();

    const displayName =
      selectedRole === 'cashier'
        ? 'CAJA'
        : 'COCINA';

    await store.claimDeviceRole(
      selectedRole,
      displayName
    );

    session =
      (
        await store.getSession()
      ).session;

    await start();

  } catch (error) {

    console.error(error);

    $('#role-error').textContent =
      error.message ||
      'No se pudo iniciar la aplicación.';

    try {
      await store.signOut();
    } catch {}

  } finally {

    const cashierButton =
      $('#enter-cashier');

    const kitchenButton =
      $('#enter-kitchen');

    if (cashierButton)
      cashierButton.disabled = false;

    if (kitchenButton)
      kitchenButton.disabled = false;
  }
}

async function start() {
  if (!session) return;

  const profile =
    await store.getProfile(
      session.user.id
    );

  if (
    !profile ||
    !profile.active
  ) {
    throw new Error(
      'Este dispositivo no está activo.'
    );
  }

  const roles =
    await store.getRoles();

  role =
    roles
      .map(x => x.role)
      .find(
        r =>
          r === 'cashier' ||
          r === 'kitchen' ||
          r === 'admin' ||
          r === 'manager'
      );

  if (!role) {
    throw new Error(
      'Este dispositivo todavía no tiene un rol asignado.'
    );
  }

  $('#auth-view').hidden = true;

  $('#app-shell').hidden = false;

  $('#user-name').textContent =
    profile.display_name ||
    role.toUpperCase();

  $('#user-role').textContent =
    role.toUpperCase();

  applyRole();

  const catalog =
    await store.loadCatalog();

  products =
    catalog.products;

  categories =
    catalog.categories;

  payments =
    catalog.payments;

  renderCatalog();
  renderPayments();
  renderCart();

  await refresh();

  await store.subscribeToOrders();
}

async function handleSession(value) {
  session = value;

  if (!session) {
    role = undefined;

    await store?.unsubscribe();

    $('#app-shell').hidden = true;

    $('#auth-view').hidden = false;

    return;
  }
}

$('#enter-cashier').onclick =
  () => enterAs('cashier');

$('#enter-kitchen').onclick =
  () => enterAs('kitchen');

$('#sign-out').onclick =
  async () => {
    try {
      await store.signOut();
    } catch (error) {
      toast(error.message);
    }
  };

$('#category-tabs').onclick =
  e => {
    if (e.target.dataset.category) {
      category =
        e.target.dataset.category;

      renderCatalog();
    }
  };

$('#product-search').oninput =
  renderCatalog;

$('#product-list').onclick =
  e => {
    const button =
      e.target.closest(
        '.add-product'
      );

    if (button) {
      add(button.dataset.id);
    }
  };

$('#open-cart').onclick =
  () =>
    $('#cart-dialog').showModal();

$('#cart-items').onclick =
  e => {
    const button =
      e.target.closest('button');

    if (!button) return;

    const line =
      cart.find(
        x =>
          x.id ===
          button.dataset.id
      );

    if (!line) return;

    if (
      button.dataset.action ===
      'more'
    ) {
      line.quantity++;
    } else if (
      --line.quantity === 0
    ) {
      cart =
        cart.filter(
          x => x !== line
        );
    }

    renderCart();
  };

$('#payment-method').onchange =
  toggleCash;

$('#cash-received').oninput =
  renderChange;

$('#cart-form').onsubmit =
  place;

$('#new-order').onclick =
  () => {
    if (
      cart.length &&
      confirm(
        '¿Vaciar el pedido actual?'
      )
    ) {
      cart = [];
      renderCart();
    }
  };

$('#refresh-kitchen').onclick =
  refresh;

$('#kitchen-list').onclick =
  async e => {
    const button =
      e.target.closest(
        '[data-order]'
      );

    if (!button) return;

    button.disabled = true;

    try {
      await store.updateOrderStatus(
        button.dataset.order,
        button.dataset.next
      );

      await refresh();

    } catch (error) {

      toast(
        `No se pudo actualizar: ${error.message}`
      );

    } finally {
      button.disabled = false;
    }
  };

$('#history-filter').onclick =
  e => {
    if (e.target.dataset.status) {

      history =
        e.target.dataset.status;

      document
        .querySelectorAll('.filter')
        .forEach(
          x =>
            x.classList.toggle(
              'is-selected',
              x === e.target
            )
        );

      renderHistory();
    }
  };

document
  .querySelectorAll('.nav-item')
  .forEach(
    button =>
      (button.onclick = () =>
        view(
          button.dataset.view
        ))
  );

try {

  store =
    await createStore({
      onOrdersChange: refresh,
      onAuthChange:
        handleSession
    });

  $('#sync-status span').textContent =
    store.mode;

  const {
    session: initial
  } =
    await store.getSession();

  await handleSession(initial);

} catch (error) {

  console.error(error);

  const errorBox =
    $('#role-error') ||
    $('#auth-error');

  if (errorBox) {
    errorBox.textContent =
      error.message;
  }
}