const config = (await import('./config.local.js')).default;
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
const supabase = createClient(config.url, config.publishableKey, { auth: { persistSession: true, autoRefreshToken: true } });

const $ = s => document.querySelector(s);
const money = n => new Intl.NumberFormat('es-PE',{style:'currency',currency:'PEN'}).format(Number(n||0));
const esc = v => String(v ?? '').replace(/[&<>\'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
let products = [];
let categories = [];
let editing = null;

function message(text, error=false){ const el=$('#message'); el.textContent=text; el.className=error?'message error':'message'; }

async function load(){
  const {data: sessionData} = await supabase.auth.getSession();
  let session = sessionData.session;
  if(!session){ const {data,error}=await supabase.auth.signInAnonymously(); if(error) throw error; session=data.session; }

  const {data: roles,error: roleError}=await supabase.from('user_roles').select('role').eq('user_id',session.user.id).eq('active',true);
  if(roleError) throw roleError;
  if(!roles?.some(r=>['admin','manager'].includes(r.role))) throw new Error('Esta sección requiere permisos de Administrador o Gerente.');

  const [p,c] = await Promise.all([
    supabase.rpc('admin_list_products'),
    supabase.rpc('admin_list_categories')
  ]);
  if(p.error) throw p.error; if(c.error) throw c.error;
  products=p.data||[]; categories=c.data||[];
  render();
}

function render(){
  $('#category').innerHTML='<option value="">Sin categoría</option>'+categories.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
  $('#products').innerHTML=products.map(p=>`<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.description||'')}</small></td><td>${esc(p.category_name||p.category||'—')}</td><td><strong>${money(p.price)}</strong></td><td>${p.active?'🟢 Disponible':'🔴 Inactivo'}</td><td><button data-edit="${p.id}">Editar</button><button data-toggle="${p.id}">${p.active?'Desactivar':'Activar'}</button><button data-history="${p.id}">Historial</button></td></tr>`).join('') || '<tr><td colspan="5">No hay productos.</td></tr>';
  $('#categories').innerHTML=categories.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.code)}</td><td>${c.active?'🟢':'🔴'}</td><td><button data-cat-edit="${c.id}">Editar</button></td></tr>`).join('') || '<tr><td colspan="4">No hay categorías.</td></tr>';
}

function resetProduct(){ editing=null; $('#product-form').reset(); $('#product-id').value=''; $('#form-title').textContent='Agregar producto'; $('#save-product').textContent='Agregar producto'; $('#active').checked=true; $('#sort').value='0'; $('#category').value=''; }
function editProduct(id){ const p=products.find(x=>x.id===id); if(!p)return; editing=p; $('#product-id').value=p.id; $('#form-title').textContent='Editar producto'; $('#save-product').textContent='Guardar cambios'; $('#name').value=p.name; $('#price').value=p.price; $('#description').value=p.description||''; $('#category').value=p.category_id||''; $('#active').checked=p.active; $('#sort').value=p.sort_order||0; scrollTo(0,0); }

$('#product-form').onsubmit=async e=>{ e.preventDefault(); const button=$('#save-product'); button.disabled=true; try{ const payload={p_id:editing?.id||null,p_name:$('#name').value,p_price:Number($('#price').value),p_description:$('#description').value,p_category_id:$('#category').value||null,p_active:$('#active').checked,p_sort_order:Number($('#sort').value||0)}; const {error}=await supabase.rpc('admin_upsert_product',payload); if(error)throw error; message(editing?'Producto actualizado.':'Producto agregado.'); resetProduct(); await load(); }catch(err){message(err.message,true)}finally{button.disabled=false} };

$('#products').onclick=async e=>{ const edit=e.target.closest('[data-edit]'); const toggle=e.target.closest('[data-toggle]'); const hist=e.target.closest('[data-history]'); if(edit)return editProduct(edit.dataset.edit); if(toggle){ const p=products.find(x=>x.id===toggle.dataset.toggle); if(!p)return; if(!confirm(`${p.active?'¿Desactivar':'¿Activar'} ${p.name}?`))return; const {error}=await supabase.rpc('admin_set_product_active',{p_id:p.id,p_active:!p.active}); if(error)message(error.message,true); else {message('Estado actualizado.'); await load();} } if(hist){ const {data,error}=await supabase.rpc('admin_price_history',{p_product_id:hist.dataset.history}); if(error)message(error.message,true); else alert((data||[]).map(x=>`${new Date(x.changed_at).toLocaleString('es-PE')} · ${x.old_price===null?'Nuevo':money(x.old_price)} → ${money(x.new_price)}`).join('\n')||'Sin historial.'); }};

$('#cancel-product').onclick=resetProduct;
$('#new-product').onclick=resetProduct;

$('#category-form').onsubmit=async e=>{ e.preventDefault(); const {error}=await supabase.rpc('admin_upsert_category',{p_id:$('#category-id').value||null,p_name:$('#category-name').value,p_code:$('#category-code').value,p_description:$('#category-description').value,p_active:$('#category-active').checked,p_sort_order:Number($('#category-sort').value||0)}); if(error)message(error.message,true); else {message('Categoría guardada.'); $('#category-form').reset(); await load();} };
$('#categories').onclick=e=>{ const b=e.target.closest('[data-cat-edit]'); if(!b)return; const c=categories.find(x=>x.id===b.dataset.catEdit); if(!c)return; $('#category-id').value=c.id; $('#category-name').value=c.name; $('#category-code').value=c.code; $('#category-description').value=c.description||''; $('#category-active').checked=c.active; $('#category-sort').value=c.sort_order||0; };

$('#signout').onclick=async()=>{await supabase.auth.signOut();location.href='index.html'};

try{ await load(); }catch(error){ $('#app').hidden=true; $('#blocked').hidden=false; $('#blocked-message').textContent=error.message; }
