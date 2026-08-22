# Anticuchería Coco Loco · Pedidos

Aplicación web móvil para caja y cocina. Funciona sin instalación en **modo local** y está preparada para sincronizar pedidos en tiempo real con Supabase.

## Funcionalidades

- Catálogo completo, cantidades, carrito, total, efectivo con vuelto y Yape.
- Número automático, cocina con estados `NUEVO → PREPARANDO → LISTO → ENTREGADO`, historial y resumen diario de ventas.
- Diseño PWA, preparado para empaquetar después con Capacitor como APK Android.
- En modo local, los datos se guardan en el navegador y se actualizan entre pestañas del mismo navegador.

## Activar uso entre dispositivos

1. Cree/configure un proyecto Supabase y ejecute [supabase/schema.sql](supabase/schema.sql).
2. Configure cuentas autenticadas para el personal de caja y cocina. El esquema no abre los pedidos a usuarios anónimos.
3. Copie `config.example.js` como `config.local.js` y añada la URL del proyecto y la **publishable key**. Está ignorado por Git. Nunca use `service_role` ni una clave secreta en el cliente.
4. Sirva la carpeta con un servidor web. La app cargará Supabase y escuchará cambios de `orders` y `order_items`.

No se incluyeron credenciales, claves ni configuraciones remotas.
