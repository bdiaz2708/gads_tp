// CoffeLink CRM — backend sin dependencias externas (Node.js >= 18)
// Ejecutar: node server.js  →  http://localhost:3000
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = process.env.DB_FILE || path.join(DATA_DIR, 'db.json');
const SESSION_HOURS = 8;

/* ───────────────────────── Utilidades ───────────────────────── */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const fail = (status, msg) => { throw new HttpError(status, msg); };
const nowIso = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

function hashPassword(pwd, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(String(pwd), salt, 64).toString('hex');
}
function verifyPassword(pwd, stored) {
  const [salt, hash] = String(stored || '').split(':');
  if (!salt || !hash) return false;
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(String(pwd), salt, 64);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ───────────────────────── Base de datos (archivo JSON) ───────────────────────── */
let db;
function seed() {
  const d = {
    seq: {}, users: [], stages: [], activityTypes: [], origins: [], lossReasons: [], products: [],
    companies: [], contacts: [], opps: [], stageHistory: [], activities: [], audit: [],
  };
  const add = (coll, obj) => { d.seq[coll] = (d.seq[coll] || 0) + 1; const o = { id: d.seq[coll], ...obj }; d[coll].push(o); return o; };
  const t = (daysAgo, h = 10) => { const x = new Date(); x.setDate(x.getDate() - daysAgo); x.setHours(h, 0, 0, 0); return x.toISOString(); };

  const admin = add('users', { username: 'admin', name: 'Admin General', role: 'admin', active: true, pwd: hashPassword('12345') });
  const resp = add('users', { username: 'comercial', name: 'Carolina Ríos', role: 'comercial', active: true, pwd: hashPassword('12345') });
  const lucia = add('users', { username: 'vendedor', name: 'Lucía Fernández', role: 'vendedor', active: true, pwd: hashPassword('12345') });
  const martin = add('users', { username: 'martin', name: 'Martín López', role: 'vendedor', active: true, pwd: hashPassword('12345') });

  const st = {};
  [['Contacto inicial', 'open', 10, false], ['Relevamiento', 'open', 25, false], ['Degustación', 'open', 40, false],
   ['Propuesta', 'open', 60, true], ['Negociación', 'open', 80, true], ['Ganada', 'won', 100, true], ['Perdida', 'lost', 0, false]]
    .forEach(([name, type, prob, requiresTasting], i) => { st[name] = add('stages', { name, type, prob, requiresTasting, order: i + 1, active: true }); });

  const at = {};
  [['Llamada'], ['Correo electrónico'], ['Mensaje'], ['Visita al local (reunión presencial)'], ['Reunión virtual'],
   ['Degustación / demostración', 'degustacion'], ['Envío de propuesta'], ['Nota interna'], ['Otro']]
    .forEach(([name, key]) => { at[name] = add('activityTypes', { name, key: key || null, active: true }); });

  const og = {};
  ['Visita en frío al local', 'Recomendación de otro cliente', 'Redes sociales', 'Sitio web', 'Feria / evento gastronómico', 'Cliente existente']
    .forEach(name => { og[name] = add('origins', { name, active: true }); });

  const lr = {};
  ['Precio', 'Continúa con su proveedor actual', 'No le gustó el perfil de sabor en la degustación', 'Volumen insuficiente',
   'No acepta condiciones de comodato', 'Sin respuesta', 'Decisión postergada']
    .forEach(name => { lr[name] = add('lossReasons', { name, active: true }); });

  const pr = {};
  [['Blend Clásico', 'Café en grano', '1 kg', 18500], ['Colombia Premium', 'Especialidad', '500 g', 16000],
   ['Brasil Santos', 'Café en grano', '1 kg', 17200], ['Descafeinado', 'Café en grano', '500 g', 12500],
   ['Comodato máquina espresso 2 grupos', 'Equipamiento', 'Comodato', 0]]
    .forEach(([name, type, format, pricePerKg]) => { pr[name] = add('products', { name, type, format, pricePerKg, active: true }); });

  const audit = { createdAt: t(30), createdBy: admin.id, updatedAt: t(30), updatedBy: admin.id };
  const c1 = add('companies', { name: 'Café del Centro', cuit: '30-71234567-8', industry: 'Cafetería de especialidad', email: 'compras@cafecentro.demo', phone: '11 4444-1200', address: 'Arieta 3100', city: 'San Justo', web: '', status: 'Potencial', ownerId: lucia.id, originId: og['Visita en frío al local'].id, notes: 'Abre 7 a 21 h.', branches: 2, consumption: 65, currentSupplier: 'Tostadero Oeste', equipment: 'Máquina propia', ...audit });
  const c2 = add('companies', { name: 'Origen Café', cuit: '', industry: 'Cafetería de especialidad', email: 'hola@origen.demo', phone: '11 4444-3400', address: 'Av. de Mayo 500', city: 'Ramos Mejía', web: 'origen.demo', status: 'Potencial', ownerId: martin.id, originId: og['Redes sociales'].id, notes: '', branches: 1, consumption: 35, currentSupplier: '', equipment: 'Sin máquina', ...audit });
  const c3 = add('companies', { name: 'La Esquina Coffee', cuit: '30-70987654-3', industry: 'Cafetería tradicional / bar', email: 'admin@esquina.demo', phone: '11 4444-9800', address: 'Rivadavia 18000', city: 'Morón', web: '', status: 'Cliente', ownerId: lucia.id, originId: og['Recomendación de otro cliente'].id, notes: 'Cliente desde 2025.', branches: 3, consumption: 110, currentSupplier: 'CoffeLink', equipment: 'Comodato CoffeLink', ...audit });
  const c4 = add('companies', { name: 'Tostado Sur', cuit: '', industry: 'Panadería / confitería', email: '', phone: '11 4444-7700', address: 'Cristianía 2000', city: 'Lomas del Mirador', web: '', status: 'Inactivo', ownerId: martin.id, originId: og['Feria / evento gastronómico'].id, notes: '', branches: 1, consumption: 25, currentSupplier: 'Café Mayorista SA', equipment: 'Comodato de otro proveedor', ...audit });

  const k1 = add('contacts', { firstName: 'Sofía', lastName: 'Gómez', doc: '', position: 'Encargada', email: 'sofia@cafecentro.demo', phone: '11 5555-1200', companyId: c1.id, ownerId: lucia.id, status: 'Potencial', originId: og['Visita en frío al local'].id, notes: '', ...audit });
  const k2 = add('contacts', { firstName: 'Nicolás', lastName: 'Ruiz', doc: '', position: 'Dueño', email: 'nicolas@origen.demo', phone: '11 5555-3400', companyId: c2.id, ownerId: martin.id, status: 'Potencial', originId: og['Redes sociales'].id, notes: '', ...audit });
  const k3 = add('contacts', { firstName: 'Carla', lastName: 'Méndez', doc: '', position: 'Compras', email: 'carla@esquina.demo', phone: '11 5555-9800', companyId: c3.id, ownerId: lucia.id, status: 'Cliente', originId: og['Recomendación de otro cliente'].id, notes: '', ...audit });
  const k4 = add('contacts', { firstName: 'Julián', lastName: 'Paz', doc: '30111222', position: 'Barista independiente', email: 'julian@demo.com', phone: '11 5555-0001', companyId: null, ownerId: martin.id, status: 'Potencial', originId: og['Feria / evento gastronómico'].id, notes: 'Arma un carro de café para eventos.', ...audit });

  const mkOpp = (o, path) => {
    const opp = add('opps', { probManual: false, finalValue: null, closeDate: null, lossReasonId: null, ...o, ...audit });
    path.forEach(([from, to, days, userId, note]) => add('stageHistory', { oppId: opp.id, fromStageId: from ? st[from].id : null, toStageId: st[to].id, at: t(days, 11), userId, note: note || '' }));
    return opp;
  };
  const o1 = mkOpp({ title: 'Cambio de proveedor — 2 sucursales', companyId: c1.id, contactId: k1.id, ownerId: lucia.id, productId: pr['Colombia Premium'].id, value: 480000, stageId: st['Negociación'].id, status: 'Abierta', prob: 80, expectedClose: today(), originId: og['Visita en frío al local'].id, notes: 'Revisar volumen mensual', volumeKg: 60, deliveryFreq: 'Semanal', comodato: false },
    [[null, 'Contacto inicial', 20, lucia.id], ['Contacto inicial', 'Relevamiento', 18, lucia.id], ['Relevamiento', 'Degustación', 15, lucia.id], ['Degustación', 'Propuesta', 10, lucia.id], ['Propuesta', 'Negociación', 5, lucia.id, 'Pidieron descuento por volumen']]);
  const o2 = mkOpp({ title: 'Primer abastecimiento Origen', companyId: c2.id, contactId: k2.id, ownerId: martin.id, productId: pr['Blend Clásico'].id, value: 210000, stageId: st['Degustación'].id, status: 'Abierta', prob: 40, expectedClose: '', originId: og['Redes sociales'].id, notes: 'Coordinar prueba de producto', volumeKg: 30, deliveryFreq: 'Quincenal', comodato: true },
    [[null, 'Contacto inicial', 12, martin.id], ['Contacto inicial', 'Relevamiento', 9, martin.id], ['Relevamiento', 'Degustación', 4, martin.id]]);
  const o3 = mkOpp({ title: 'Ampliación a 3 sucursales', companyId: c3.id, contactId: k3.id, ownerId: lucia.id, productId: pr['Brasil Santos'].id, value: 690000, stageId: st['Ganada'].id, status: 'Ganada', prob: 100, expectedClose: '', originId: og['Cliente existente'].id, notes: '', volumeKg: 110, deliveryFreq: 'Semanal', comodato: true, finalValue: 650000, closeDate: t(2).slice(0, 10) },
    [[null, 'Relevamiento', 25, lucia.id], ['Relevamiento', 'Degustación', 20, lucia.id], ['Degustación', 'Propuesta', 14, lucia.id], ['Propuesta', 'Ganada', 2, lucia.id, 'Firmó por 110 kg/mes']]);
  const o4 = mkOpp({ title: 'Blend para panadería', companyId: c4.id, contactId: null, ownerId: martin.id, productId: pr['Blend Clásico'].id, value: 160000, stageId: st['Perdida'].id, status: 'Perdida', prob: 0, expectedClose: '', originId: og['Feria / evento gastronómico'].id, notes: '', volumeKg: 25, deliveryFreq: 'Mensual', comodato: false, lossReasonId: lr['Continúa con su proveedor actual'].id, closeDate: t(6).slice(0, 10) },
    [[null, 'Contacto inicial', 16, martin.id], ['Contacto inicial', 'Degustación', 12, martin.id], ['Degustación', 'Perdida', 6, martin.id, 'Mantiene comodato con su proveedor']]);
  mkOpp({ title: 'Carro de café para eventos', companyId: null, contactId: k4.id, ownerId: martin.id, productId: pr['Colombia Premium'].id, value: 90000, stageId: st['Contacto inicial'].id, status: 'Abierta', prob: 10, expectedClose: '', originId: og['Feria / evento gastronómico'].id, notes: '', volumeKg: 8, deliveryFreq: 'Mensual', comodato: false },
    [[null, 'Contacto inicial', 3, martin.id]]);

  const act = (typeName, days, userId, companyId, contactId, oppId, description, result) =>
    add('activities', { typeId: at[typeName].id, at: t(days, 15), userId, companyId, contactId, oppId, description, result, createdAt: t(days, 15) });
  act('Visita al local (reunión presencial)', 18, lucia.id, c1.id, k1.id, o1.id, 'Relevamiento de consumo y equipamiento del local.', 'Consumen ~60 kg/mes, máquina propia de 2 grupos.');
  act('Degustación / demostración', 15, lucia.id, c1.id, k1.id, o1.id, 'Degustación de Colombia Premium con el equipo de baristas.', 'Muy buena aceptación; piden propuesta.');
  act('Envío de propuesta', 10, lucia.id, c1.id, k1.id, o1.id, 'Se envió propuesta por 60 kg/mes con entrega semanal.', 'Quedan en responder.');
  act('Llamada', 9, martin.id, c2.id, k2.id, o2.id, 'Llamada para coordinar degustación.', 'Se coordinó degustación para la próxima semana.');
  act('Degustación / demostración', 20, lucia.id, c3.id, k3.id, o3.id, 'Degustación de Brasil Santos.', 'Aprobado por el dueño.');
  act('Envío de propuesta', 14, lucia.id, c3.id, k3.id, o3.id, 'Propuesta por 110 kg/mes con comodato.', 'Aceptada con ajuste de precio.');
  act('Degustación / demostración', 12, martin.id, c4.id, null, o4.id, 'Degustación de Blend Clásico.', 'Les gustó pero tienen comodato vigente.');
  act('Mensaje', 3, martin.id, null, k4.id, null, 'WhatsApp de presentación luego de la feria.', 'Pidió lista de precios.');
  return d;
}

function loadDb() {
  if (fs.existsSync(DB_FILE)) db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  else { db = seed(); saveDb(); console.log('Base de datos inicial creada en', DB_FILE); }
}
function saveDb() {
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
  fs.renameSync(tmp, DB_FILE);
}
function insert(coll, obj) { db.seq[coll] = (db.seq[coll] || 0) + 1; const o = { id: db.seq[coll], ...obj }; db[coll].push(o); return o; }
const find = (coll, id) => db[coll].find(x => x.id === Number(id));
const mustFind = (coll, id, label) => find(coll, id) || fail(404, `${label} inexistente.`);

function audit(u, entity, entityId, action, detail = '') {
  insert('audit', { at: nowIso(), userId: u.id, entity, entityId, action, detail });
}

/* ───────────────────────── Sesiones y permisos ───────────────────────── */
const sessions = new Map(); // token -> { userId, exp }
const ROLES = { admin: 'Administrador', comercial: 'Responsable comercial', vendedor: 'Vendedor' };
const isMgr = u => u.role === 'admin' || u.role === 'comercial';
const isAdmin = u => u.role === 'admin';
const requireRole = (u, ...roles) => { if (!roles.includes(u.role)) fail(403, 'No tenés permisos para esta operación.'); };

const canSeeCompany = (u, c) => !!c && (isMgr(u) || c.ownerId === u.id);
const canSeeContact = (u, k) => !!k && (isMgr(u) || k.ownerId === u.id || (k.companyId && canSeeCompany(u, find('companies', k.companyId))));
const canSeeOpp = (u, o) => !!o && (isMgr(u) || o.ownerId === u.id);
const canSeeActivity = (u, a) => isMgr(u) || a.userId === u.id ||
  (a.oppId && canSeeOpp(u, find('opps', a.oppId))) ||
  (a.companyId && canSeeCompany(u, find('companies', a.companyId))) ||
  (a.contactId && canSeeContact(u, find('contacts', a.contactId)));
const canEditOwned = (u, rec) => isMgr(u) || rec.ownerId === u.id;

function currentUser(req) {
  const tok = (req.headers.authorization || '').replace(/^Bearer /, '');
  const s = sessions.get(tok);
  if (!s || s.exp < Date.now()) { sessions.delete(tok); fail(401, 'Sesión expirada. Iniciá sesión nuevamente.'); }
  const u = find('users', s.userId);
  if (!u || !u.active) { sessions.delete(tok); fail(401, 'Usuario deshabilitado.'); }
  s.exp = Date.now() + SESSION_HOURS * 3600e3;
  return u;
}
const publicUser = u => ({ id: u.id, username: u.username, name: u.name, role: u.role, active: u.active });

/* ───────────────────────── Validación de campos ───────────────────────── */
const STATUS_PARTY = ['Potencial', 'Cliente', 'Inactivo', 'No contactar'];
const INDUSTRIES = ['Cafetería de especialidad', 'Cafetería tradicional / bar', 'Panadería / confitería', 'Restaurante', 'Hotel', 'Oficina / empresa', 'Otro'];
const EQUIPMENT = ['Máquina propia', 'Comodato CoffeLink', 'Comodato de otro proveedor', 'Sin máquina'];
const DELIVERY = ['Semanal', 'Quincenal', 'Mensual'];

const str = (v, max = 300) => (v == null ? '' : String(v).trim().slice(0, max));
function reqStr(v, label, max) { const s = str(v, max); if (!s) fail(400, `${label} es obligatorio.`); return s; }
function optEmail(v) { const s = str(v, 120); if (s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) fail(400, 'El correo electrónico no es válido.'); return s; }
function optNum(v, label, { min = 0, max = 1e12, int = false } = {}) {
  if (v === '' || v == null) return null;
  const n = Number(v); if (!Number.isFinite(n) || n < min || n > max || (int && !Number.isInteger(n))) fail(400, `${label} no es válido.`);
  return n;
}
function optDate(v, label) { const s = str(v, 10); if (s && !/^\d{4}-\d{2}-\d{2}$/.test(s)) fail(400, `${label} no es una fecha válida.`); return s; }
function oneOf(v, list, label) { const s = str(v); if (!list.includes(s)) fail(400, `${label} no es válido.`); return s; }
function activeRef(coll, id, label, { required = true, current = null } = {}) {
  if (id === '' || id == null) { if (required) fail(400, `${label} es obligatorio.`); return null; }
  const r = find(coll, id); if (!r) fail(400, `${label} inexistente.`);
  if (r.active === false && r.id !== current) fail(400, `${label} está deshabilitado.`);
  return r.id;
}
function sellerRef(id, current) {
  const u = find('users', id); if (!u) fail(400, 'Responsable comercial inexistente.');
  if (!u.active && u.id !== current) fail(400, 'El responsable comercial está deshabilitado.');
  if (u.role === 'admin' && u.id !== current) fail(400, 'El responsable debe ser un vendedor o el responsable comercial.');
  return u.id;
}
function cuit(v) { const s = str(v, 13); if (s && !/^\d{2}-?\d{8}-?\d$/.test(s)) fail(400, 'El CUIT debe tener 11 dígitos (XX-XXXXXXXX-X).'); return s; }

/* Registra en auditoría qué campos cambiaron */
function applyChanges(u, entity, rec, data, labels) {
  const changed = Object.keys(data).filter(k => JSON.stringify(rec[k]) !== JSON.stringify(data[k]));
  if (!changed.length) return [];
  Object.assign(rec, data, { updatedAt: nowIso(), updatedBy: u.id });
  audit(u, entity, rec.id, 'Modificación', changed.map(k => labels[k] || k).join(', '));
  return changed;
}

/* ───────────────────────── Entidades ───────────────────────── */
function companyData(b, u, rec) {
  const d = {
    name: reqStr(b.name, 'La razón social / nombre comercial', 120), cuit: cuit(b.cuit),
    industry: oneOf(b.industry, INDUSTRIES, 'El tipo de establecimiento'), email: optEmail(b.email), phone: str(b.phone, 40),
    address: str(b.address, 160), city: str(b.city, 80), web: str(b.web, 120), status: oneOf(b.status || 'Potencial', STATUS_PARTY, 'El estado'),
    originId: activeRef('origins', b.originId, 'El origen', { current: rec && rec.originId }), notes: str(b.notes, 2000),
    branches: optNum(b.branches, 'La cantidad de sucursales', { min: 1, max: 999, int: true }) || 1,
    consumption: optNum(b.consumption, 'El consumo estimado', { max: 100000 }) || 0,
    currentSupplier: str(b.currentSupplier, 120), equipment: oneOf(b.equipment || 'Sin máquina', EQUIPMENT, 'El equipamiento'),
  };
  d.ownerId = isMgr(u) ? sellerRef(b.ownerId || (rec ? rec.ownerId : u.id), rec && rec.ownerId) : (rec ? rec.ownerId : u.id);
  if (rec && !isMgr(u) && b.ownerId && Number(b.ownerId) !== rec.ownerId) fail(403, 'Solo el administrador o el responsable comercial pueden reasignar.');
  return d;
}
function contactData(b, u, rec) {
  const d = {
    firstName: reqStr(b.firstName, 'El nombre', 60), lastName: reqStr(b.lastName, 'El apellido', 60), doc: str(b.doc, 20),
    position: str(b.position, 80), email: optEmail(b.email), phone: str(b.phone, 40), status: oneOf(b.status || 'Potencial', STATUS_PARTY, 'El estado'),
    originId: activeRef('origins', b.originId, 'El origen', { current: rec && rec.originId }), notes: str(b.notes, 2000), companyId: null,
  };
  if (b.companyId) {
    const c = find('companies', b.companyId);
    if (!canSeeCompany(u, c)) fail(400, 'Cafetería inexistente o sin acceso.');
    d.companyId = c.id;
  }
  d.ownerId = isMgr(u) ? sellerRef(b.ownerId || (rec ? rec.ownerId : u.id), rec && rec.ownerId) : (rec ? rec.ownerId : u.id);
  if (rec && !isMgr(u) && b.ownerId && Number(b.ownerId) !== rec.ownerId) fail(403, 'Solo el administrador o el responsable comercial pueden reasignar.');
  return d;
}
function oppData(b, u, rec) {
  const d = {
    title: reqStr(b.title, 'El título', 120), productId: activeRef('products', b.productId, 'El producto', { current: rec && rec.productId }),
    value: optNum(b.value, 'El valor estimado'), expectedClose: optDate(b.expectedClose, 'La fecha estimada de cierre'),
    originId: activeRef('origins', b.originId, 'El origen', { current: rec && rec.originId }), notes: str(b.notes, 2000),
    volumeKg: optNum(b.volumeKg, 'El volumen mensual (kg)', { max: 100000 }), deliveryFreq: oneOf(b.deliveryFreq || 'Semanal', DELIVERY, 'La frecuencia de entrega'),
    comodato: b.comodato === true || b.comodato === 'true' || b.comodato === 'on', companyId: null, contactId: null,
  };
  const p = optNum(b.prob, 'La probabilidad', { max: 100, int: true });
  d.probManual = p != null; if (p != null) d.prob = p;
  if (b.companyId) { const c = find('companies', b.companyId); if (!canSeeCompany(u, c)) fail(400, 'Cafetería inexistente o sin acceso.'); d.companyId = c.id; }
  if (b.contactId) {
    const k = find('contacts', b.contactId); if (!canSeeContact(u, k)) fail(400, 'Contacto inexistente o sin acceso.');
    if (d.companyId && k.companyId && k.companyId !== d.companyId) fail(400, 'El contacto pertenece a otra cafetería.');
    d.contactId = k.id; if (!d.companyId && k.companyId) d.companyId = k.companyId;
  }
  if (!d.companyId && !d.contactId) fail(400, 'La oportunidad debe estar asociada a una cafetería o a un contacto.');
  d.ownerId = isMgr(u) ? sellerRef(b.ownerId || (rec ? rec.ownerId : u.id), rec && rec.ownerId) : (rec ? rec.ownerId : u.id);
  if (rec && !isMgr(u) && b.ownerId && Number(b.ownerId) !== rec.ownerId) fail(403, 'Solo el administrador o el responsable comercial pueden reasignar oportunidades.');
  return d;
}
const OPP_LABELS = { title: 'título', productId: 'producto', value: 'valor estimado', expectedClose: 'fecha estimada', originId: 'origen', notes: 'observaciones', volumeKg: 'volumen kg/mes', deliveryFreq: 'frecuencia', comodato: 'comodato', companyId: 'cafetería', contactId: 'contacto', ownerId: 'responsable', prob: 'probabilidad', probManual: 'probabilidad', finalValue: 'valor final', closeDate: 'fecha de cierre', lossReasonId: 'motivo de pérdida' };

const sortedStages = () => db.stages.slice().sort((a, b) => a.order - b.order);
const hasTasting = oppId => db.activities.some(a => a.oppId === oppId && (find('activityTypes', a.typeId) || {}).key === 'degustacion');

/** Cambio de etapa con todas las reglas de negocio. */
function changeStage(u, o, b) {
  if (!canSeeOpp(u, o)) fail(404, 'Oportunidad inexistente.');
  const st = find('stages', b.stageId); if (!st || !st.active) fail(400, 'Etapa inexistente o deshabilitada.');
  if (st.id === o.stageId) fail(400, 'La oportunidad ya se encuentra en esa etapa.');
  const wasClosed = o.status !== 'Abierta';
  const note = str(b.note, 500);
  if (wasClosed) {
    if (!isMgr(u)) fail(403, 'La oportunidad está cerrada: solo el responsable comercial o el administrador pueden autorizar el cambio.');
    if (!note) fail(400, 'Para modificar una oportunidad cerrada indicá el motivo de la autorización.');
  }
  if (st.requiresTasting && !hasTasting(o.id)) fail(400, `Para pasar a "${st.name}" debe registrarse antes una actividad de degustación en esta oportunidad.`);
  const from = find('stages', o.stageId);
  if (st.type === 'won') {
    const closeDate = optDate(b.closeDate, 'La fecha de cierre'); if (!closeDate) fail(400, 'Una oportunidad ganada debe registrar la fecha real de cierre.');
    if (closeDate > today()) fail(400, 'La fecha de cierre no puede ser futura.');
    const fv = optNum(b.finalValue, 'El valor final'); if (!fv) fail(400, 'Una oportunidad ganada debe registrar el valor final.');
    Object.assign(o, { status: 'Ganada', closeDate, finalValue: fv, lossReasonId: null });
    const c = find('companies', o.companyId);
    if (c && c.status !== 'Cliente') { c.status = 'Cliente'; audit(u, 'companies', c.id, 'Cambio de estado automático', `Pasa a Cliente por oportunidad #${o.id} ganada`); }
    const k = !o.companyId && find('contacts', o.contactId);
    if (k && k.status !== 'Cliente') { k.status = 'Cliente'; audit(u, 'contacts', k.id, 'Cambio de estado automático', `Pasa a Cliente por oportunidad #${o.id} ganada`); }
  } else if (st.type === 'lost') {
    const closeDate = optDate(b.closeDate, 'La fecha de cierre'); if (!closeDate) fail(400, 'Una oportunidad perdida debe registrar la fecha real de cierre.');
    if (closeDate > today()) fail(400, 'La fecha de cierre no puede ser futura.');
    const lossReasonId = activeRef('lossReasons', b.lossReasonId, 'El motivo de pérdida');
    Object.assign(o, { status: 'Perdida', closeDate, lossReasonId, finalValue: null });
  } else {
    Object.assign(o, { status: 'Abierta', closeDate: null, lossReasonId: null, finalValue: null });
  }
  o.stageId = st.id; if (!o.probManual || st.type !== 'open') o.prob = st.prob;
  if (st.type !== 'open') o.probManual = false;
  o.updatedAt = nowIso(); o.updatedBy = u.id;
  insert('stageHistory', { oppId: o.id, fromStageId: from ? from.id : null, toStageId: st.id, at: nowIso(), userId: u.id, note });
  if (wasClosed) audit(u, 'opps', o.id, 'Cambio autorizado sobre oportunidad cerrada', `${from ? from.name : ''} → ${st.name}. Motivo: ${note}`);
  return o;
}

/* ───────────────────────── Rutas de la API ───────────────────────── */
const CONFIG_KINDS = { stages: 'Etapa', activityTypes: 'Tipo de actividad', origins: 'Origen', lossReasons: 'Motivo de pérdida' };
const routes = [];
const route = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });

route('POST', '/api/login', (req, b) => {
  const u = db.users.find(x => x.username === str(b.username).toLowerCase());
  if (!u || !verifyPassword(b.password, u.pwd)) fail(401, 'Usuario o contraseña incorrectos.');
  if (!u.active) fail(403, 'El usuario está deshabilitado.');
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId: u.id, exp: Date.now() + SESSION_HOURS * 3600e3 });
  return { token, user: publicUser(u) };
}, { public: true });

route('POST', '/api/logout', req => { sessions.delete((req.headers.authorization || '').replace(/^Bearer /, '')); return { ok: true }; }, { public: true });

// Devuelve solo la información que el rol del usuario tiene permitido ver
route('GET', '/api/data', (req, b, u) => {
  const opps = db.opps.filter(o => canSeeOpp(u, o)); const oppIds = new Set(opps.map(o => o.id));
  return {
    me: publicUser(u), roles: ROLES, industries: INDUSTRIES, equipment: EQUIPMENT, delivery: DELIVERY, partyStatus: STATUS_PARTY,
    users: db.users.map(publicUser), stages: sortedStages(), activityTypes: db.activityTypes, origins: db.origins, lossReasons: db.lossReasons, products: db.products,
    companies: db.companies.filter(c => canSeeCompany(u, c)), contacts: db.contacts.filter(k => canSeeContact(u, k)), opps,
    stageHistory: db.stageHistory.filter(h => oppIds.has(h.oppId)), activities: db.activities.filter(a => canSeeActivity(u, a)),
    audit: isMgr(u) ? db.audit : db.audit.filter(a => a.userId === u.id || (a.entity === 'opps' && oppIds.has(a.entityId))),
  };
});

// Usuarios (solo administrador)
route('POST', '/api/users', (req, b, u) => {
  requireRole(u, 'admin');
  const username = reqStr(b.username, 'El usuario', 40).toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) fail(400, 'El usuario solo admite letras, números, punto, guion y guion bajo (mín. 3).');
  if (db.users.some(x => x.username === username)) fail(400, 'Ese nombre de usuario ya existe.');
  if (str(b.password, 200).length < 6) fail(400, 'La contraseña debe tener al menos 6 caracteres.');
  const nu = insert('users', { username, name: reqStr(b.name, 'El nombre', 80), role: oneOf(b.role, Object.keys(ROLES), 'El rol'), active: b.active !== false, pwd: hashPassword(b.password), createdAt: nowIso(), createdBy: u.id });
  audit(u, 'users', nu.id, 'Alta de usuario', `${nu.username} (${ROLES[nu.role]})`);
  return publicUser(nu);
});
route('PUT', '/api/users/:id', (req, b, u, p) => {
  requireRole(u, 'admin');
  const x = mustFind('users', p.id, 'Usuario');
  const data = { name: reqStr(b.name, 'El nombre', 80), role: oneOf(b.role, Object.keys(ROLES), 'El rol'), active: b.active !== false && b.active !== 'false' };
  if (x.id === u.id && (!data.active || data.role !== 'admin')) fail(400, 'No podés deshabilitarte ni quitarte el rol de administrador a vos mismo.');
  const pwd = str(b.password, 200);
  if (pwd && pwd.length < 6) fail(400, 'La contraseña debe tener al menos 6 caracteres.');
  applyChanges(u, 'users', x, data, { name: 'nombre', role: 'rol', active: 'habilitado' });
  if (pwd) { x.pwd = hashPassword(pwd); audit(u, 'users', x.id, 'Cambio de contraseña'); }
  if (!x.active) for (const [t, s] of sessions) if (s.userId === x.id) sessions.delete(t);
  return publicUser(x);
});

// Configuración (solo administrador). No se borra: se deshabilita.
route('POST', '/api/config/:kind', (req, b, u, p) => {
  requireRole(u, 'admin'); if (!CONFIG_KINDS[p.kind]) fail(404, 'Configuración inexistente.');
  const rec = insert(p.kind, configData(p.kind, b, null));
  audit(u, p.kind, rec.id, 'Alta de ' + CONFIG_KINDS[p.kind].toLowerCase(), rec.name);
  return rec;
});
route('PUT', '/api/config/:kind/:id', (req, b, u, p) => {
  requireRole(u, 'admin'); if (!CONFIG_KINDS[p.kind]) fail(404, 'Configuración inexistente.');
  const rec = mustFind(p.kind, p.id, CONFIG_KINDS[p.kind]);
  const data = configData(p.kind, b, rec);
  if (p.kind === 'stages') {
    const after = db.stages.map(s => (s.id === rec.id ? { ...s, ...data } : s)).filter(s => s.active);
    ['open', 'won', 'lost'].forEach(t => { if (!after.some(s => s.type === t)) fail(400, 'Debe quedar al menos una etapa activa de cada tipo (abierta, ganada y perdida).'); });
    if (data.type !== rec.type && db.opps.some(o => o.stageId === rec.id)) fail(400, 'No se puede cambiar el tipo de una etapa que tiene oportunidades.');
    if (!data.active && db.opps.some(o => o.stageId === rec.id && o.status === 'Abierta')) fail(400, 'Hay oportunidades abiertas en esta etapa: movelas antes de deshabilitarla.');
  }
  applyChanges(u, p.kind, rec, data, {});
  return rec;
});
function configData(kind, b, rec) {
  const name = reqStr(b.name, 'El nombre', 80);
  if (db[kind].some(x => x.name.toLowerCase() === name.toLowerCase() && (!rec || x.id !== rec.id))) fail(400, 'Ya existe un registro con ese nombre.');
  const d = { name, active: b.active !== false && b.active !== 'false' };
  if (kind === 'stages') {
    d.type = oneOf(b.type, ['open', 'won', 'lost'], 'El tipo de etapa');
    d.order = optNum(b.order, 'El orden', { min: 1, max: 99, int: true }) || (rec ? rec.order : db.stages.length + 1);
    d.prob = optNum(b.prob, 'La probabilidad', { max: 100, int: true }) ?? (d.type === 'won' ? 100 : 0);
    d.requiresTasting = b.requiresTasting === true || b.requiresTasting === 'true' || b.requiresTasting === 'on';
  }
  return d;
}

// Productos (administrador y responsable comercial)
const productData = b => ({ name: reqStr(b.name, 'El nombre', 100), type: reqStr(b.type, 'El tipo', 60), format: str(b.format, 40), pricePerKg: optNum(b.pricePerKg, 'El precio') || 0, active: b.active !== false && b.active !== 'false' });
route('POST', '/api/products', (req, b, u) => { requireRole(u, 'admin', 'comercial'); const r = insert('products', { ...productData(b), createdAt: nowIso(), createdBy: u.id }); audit(u, 'products', r.id, 'Alta de producto', r.name); return r; });
route('PUT', '/api/products/:id', (req, b, u, p) => { requireRole(u, 'admin', 'comercial'); const r = mustFind('products', p.id, 'Producto'); applyChanges(u, 'products', r, productData(b), {}); return r; });

// Cafeterías (empresas)
route('POST', '/api/companies', (req, b, u) => {
  const r = insert('companies', { ...companyData(b, u, null), createdAt: nowIso(), createdBy: u.id, updatedAt: nowIso(), updatedBy: u.id });
  audit(u, 'companies', r.id, 'Alta', r.name); return r;
});
route('PUT', '/api/companies/:id', (req, b, u, p) => {
  const r = find('companies', p.id); if (!canSeeCompany(u, r)) fail(404, 'Cafetería inexistente.');
  if (!canEditOwned(u, r)) fail(403, 'Solo podés modificar cafeterías de tu cartera.');
  applyChanges(u, 'companies', r, companyData(b, u, r), { ownerId: 'responsable', status: 'estado' }); return r;
});

// Contactos
route('POST', '/api/contacts', (req, b, u) => {
  const r = insert('contacts', { ...contactData(b, u, null), createdAt: nowIso(), createdBy: u.id, updatedAt: nowIso(), updatedBy: u.id });
  audit(u, 'contacts', r.id, 'Alta', `${r.firstName} ${r.lastName}`); return r;
});
route('PUT', '/api/contacts/:id', (req, b, u, p) => {
  const r = find('contacts', p.id); if (!canSeeContact(u, r)) fail(404, 'Contacto inexistente.');
  if (!canEditOwned(u, r)) fail(403, 'Solo podés modificar contactos asignados a vos.');
  applyChanges(u, 'contacts', r, contactData(b, u, r), { ownerId: 'responsable', status: 'estado' }); return r;
});

// Oportunidades
route('POST', '/api/opps', (req, b, u) => {
  const d = oppData(b, u, null);
  const st = b.stageId ? find('stages', b.stageId) : sortedStages().find(s => s.active && s.type === 'open');
  if (!st || !st.active || st.type !== 'open') fail(400, 'Una oportunidad nueva debe iniciar en una etapa abierta.');
  if (st.requiresTasting) fail(400, `No se puede iniciar en "${st.name}": requiere una degustación registrada.`);
  if (!d.probManual) d.prob = st.prob;
  const o = insert('opps', { ...d, stageId: st.id, status: 'Abierta', finalValue: null, closeDate: null, lossReasonId: null, createdAt: nowIso(), createdBy: u.id, updatedAt: nowIso(), updatedBy: u.id });
  insert('stageHistory', { oppId: o.id, fromStageId: null, toStageId: st.id, at: nowIso(), userId: u.id, note: 'Creación de la oportunidad' });
  audit(u, 'opps', o.id, 'Alta', o.title); return o;
});
route('PUT', '/api/opps/:id', (req, b, u, p) => {
  const o = find('opps', p.id); if (!canSeeOpp(u, o)) fail(404, 'Oportunidad inexistente.');
  const closed = o.status !== 'Abierta';
  if (closed && !isMgr(u)) fail(403, 'La oportunidad está cerrada: solo el responsable comercial o el administrador pueden modificarla.');
  const d = oppData(b, u, o);
  if (!d.probManual) d.prob = (find('stages', o.stageId) || {}).prob ?? o.prob;
  if (closed) {
    const reason = str(b.authNote, 500); if (!reason) fail(400, 'Indicá el motivo de la modificación de la oportunidad cerrada.');
    const closeDate = optDate(b.closeDate, 'La fecha de cierre'); if (!closeDate) fail(400, 'La fecha de cierre es obligatoria.');
    d.closeDate = closeDate;
    if (o.status === 'Ganada') { d.finalValue = optNum(b.finalValue, 'El valor final'); if (!d.finalValue) fail(400, 'El valor final es obligatorio.'); }
    else d.lossReasonId = activeRef('lossReasons', b.lossReasonId, 'El motivo de pérdida', { current: o.lossReasonId });
    const ch = applyChanges(u, 'opps', o, d, OPP_LABELS);
    if (ch.length) audit(u, 'opps', o.id, 'Modificación autorizada de oportunidad cerrada', reason);
  } else applyChanges(u, 'opps', o, d, OPP_LABELS);
  return o;
});
route('POST', '/api/opps/:id/stage', (req, b, u, p) => changeStage(u, find('opps', p.id), b));

// Actividades (hechos históricos: no se editan ni se borran)
route('POST', '/api/activities', (req, b, u) => {
  const d = { typeId: activeRef('activityTypes', b.typeId, 'El tipo de actividad'), description: reqStr(b.description, 'La descripción', 2000), result: reqStr(b.result, 'El resultado', 1000), companyId: null, contactId: null, oppId: null };
  const when = new Date(b.at); if (!b.at || isNaN(when)) fail(400, 'La fecha y hora son obligatorias.');
  if (when.getTime() > Date.now() + 5 * 60e3) fail(400, 'Una actividad registra algo que ya ocurrió: la fecha no puede ser futura.');
  d.at = when.toISOString();
  if (b.oppId) { const o = find('opps', b.oppId); if (!canSeeOpp(u, o)) fail(400, 'Oportunidad inexistente o sin acceso.'); d.oppId = o.id; d.companyId = o.companyId; d.contactId = o.contactId; }
  if (b.contactId) { const k = find('contacts', b.contactId); if (!canSeeContact(u, k)) fail(400, 'Contacto inexistente o sin acceso.'); d.contactId = k.id; if (!d.companyId) d.companyId = k.companyId; }
  if (b.companyId && !d.companyId) { const c = find('companies', b.companyId); if (!canSeeCompany(u, c)) fail(400, 'Cafetería inexistente o sin acceso.'); d.companyId = c.id; }
  if (!d.companyId && !d.contactId && !d.oppId) fail(400, 'La actividad debe relacionarse con una cafetería, un contacto o una oportunidad.');
  const a = insert('activities', { ...d, userId: u.id, createdAt: nowIso() });
  return a;
});

/* ───────────────────────── Servidor HTTP ───────────────────────── */
function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''; req.on('data', ch => { raw += ch; if (raw.length > 1e6) { reject(new HttpError(413, 'Solicitud demasiado grande.')); req.destroy(); } });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new HttpError(400, 'JSON inválido.')); } });
    req.on('error', reject);
  });
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html'))
        return send(res, 200, fs.readFileSync(path.join(__dirname, 'index.html')), 'text/html; charset=utf-8');
      return send(res, 404, 'No encontrado', 'text/plain; charset=utf-8');
    }
    for (const r of routes) {
      const m = r.method === req.method && url.pathname.match(r.re);
      if (!m) continue;
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const user = r.public ? null : currentUser(req);
      const out = r.handler(req, body, user, m.groups || {});
      if (req.method !== 'GET' && !r.public) saveDb();
      return send(res, 200, out);
    }
    fail(404, 'Ruta inexistente.');
  } catch (e) {
    if (!(e instanceof HttpError)) { console.error(e); loadDb(); } // ante un error inesperado se descartan cambios a medio aplicar
    send(res, e.status || 500, { error: e.status ? e.message : 'Error interno del servidor.' });
  }
});

loadDb();
if (require.main === module) server.listen(PORT, () => console.log(`CoffeLink CRM en http://localhost:${PORT}`));
module.exports = { server, getDb: () => db };
