import { fechaLocalISO } from '../utils/fechaCaja.js';

const MP_API = 'https://api.mercadopago.com';

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const LABELS_ESTADO = {
  approved: 'Aprobado',
  pending: 'Pendiente',
  authorized: 'Autorizado',
  in_process: 'En proceso',
  in_mediation: 'En mediación',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  refunded: 'Devuelto',
  charged_back: 'Contracargo'
};

export function mercadopagoConfigurado() {
  return Boolean(String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim());
}

function accessToken() {
  let t = String(process.env.MERCADOPAGO_ACCESS_TOKEN || '').trim();
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'"))
  ) {
    t = t.slice(1, -1).trim();
  }
  if (!t) {
    throw new Error(
      'Mercado Pago no está configurado. Agregá MERCADOPAGO_ACCESS_TOKEN en el archivo .env del backend.'
    );
  }
  return t;
}

function authHeaders(token = accessToken()) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  };
}

function externalPosId() {
  let id = String(process.env.MERCADOPAGO_EXTERNAL_POS_ID || '').trim();
  if (
    (id.startsWith('"') && id.endsWith('"')) ||
    (id.startsWith("'") && id.endsWith("'"))
  ) {
    id = id.slice(1, -1).trim();
  }
  return id || null;
}

/** Token + caja (POS) configurados para enviar monto al QR fijo. */
export function qrCobroConfigurado() {
  return mercadopagoConfigurado() && Boolean(externalPosId());
}

function montoMp(n) {
  const v = round2(n);
  if (!Number.isFinite(v) || v <= 0) {
    throw new Error('El monto a cobrar debe ser mayor a 0');
  }
  return v.toFixed(2);
}

function idempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `idem-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

async function mpJson(url, { method = 'GET', body = null, token, headersExtra } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...authHeaders(token), ...(headersExtra || {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const cause0 = Array.isArray(data?.cause) ? data.cause[0] : null;
    const msg =
      (data && typeof data === 'object' && (data.message || data.error || cause0?.description)) ||
      `Error Mercado Pago (${res.status})`;
    const err = new Error(msg);
    err.status = res.status;
    err.mp = data;
    throw err;
  }
  return data;
}

function mapOrden(order) {
  if (!order || typeof order !== 'object') return null;
  const payments = Array.isArray(order.transactions?.payments)
    ? order.transactions.payments
    : [];
  const payment = payments[0] || null;
  const status = String(order.status || '');
  const pagado = status === 'processed';
  return {
    id: order.id || null,
    status,
    status_detail: order.status_detail || null,
    pagado,
    pendiente: status === 'created',
    cancelada: status === 'canceled' || status === 'cancelled',
    expirada: status === 'expired',
    total_amount: round2(order.total_amount),
    currency: order.currency || 'ARS',
    external_reference: order.external_reference || null,
    external_pos_id: order.config?.qr?.external_pos_id || externalPosId(),
    mode: order.config?.qr?.mode || 'static',
    payment_id: payment?.id || null,
    payment_status: payment?.status || null,
    created_date: order.created_date || null,
    last_updated_date: order.last_updated_date || null,
    qr_data: order.type_response?.qr_data || null
  };
}

/**
 * Crea una orden QR en modo static: el monto queda asociado al QR fijo de la caja (POS).
 * Requiere MERCADOPAGO_EXTERNAL_POS_ID = external_id del POS en Mercado Pago.
 */
export async function crearOrdenQr({ monto, descripcion, external_reference } = {}) {
  const posId = externalPosId();
  if (!posId) {
    throw new Error(
      'Falta MERCADOPAGO_EXTERNAL_POS_ID en backend/.env (external_id de la caja/POS vinculada al QR fijo).'
    );
  }

  const amount = montoMp(monto);
  const ref =
    String(external_reference || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) || `venta-${Date.now()}`;
  const desc = String(descripcion || 'Venta mostrador')
    .trim()
    .slice(0, 150);

  const body = {
    type: 'qr',
    total_amount: amount,
    description: desc,
    external_reference: ref,
    expiration_time: 'PT15M',
    config: {
      qr: {
        external_pos_id: posId,
        mode: 'static'
      }
    },
    transactions: {
      payments: [{ amount }]
    },
    items: [
      {
        title: desc || 'Venta mostrador',
        unit_price: amount,
        quantity: 1,
        unit_measure: 'unit',
        external_code: 'VENTA',
        external_categories: [{ id: 'others' }]
      }
    ]
  };

  const order = await mpJson(`${MP_API}/v1/orders`, {
    method: 'POST',
    body,
    headersExtra: { 'X-Idempotency-Key': idempotencyKey() }
  });

  return mapOrden(order);
}

export async function consultarOrdenQr(orderId) {
  const id = String(orderId || '').trim();
  if (!id) throw new Error('Falta el id de la orden');
  const order = await mpJson(`${MP_API}/v1/orders/${encodeURIComponent(id)}`);
  return mapOrden(order);
}

export async function cancelarOrdenQr(orderId) {
  const id = String(orderId || '').trim();
  if (!id) throw new Error('Falta el id de la orden');
  const order = await mpJson(`${MP_API}/v1/orders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    headersExtra: { 'X-Idempotency-Key': idempotencyKey() }
  });
  return mapOrden(order);
}

export function infoQrCobro() {
  const pos = externalPosId();
  return {
    qr_cobro_configurado: qrCobroConfigurado(),
    external_pos_id: pos,
    modo: 'static',
    mensaje: pos
      ? 'QR fijo listo: al cobrar se envía el monto a la caja/POS de Mercado Pago.'
      : 'Para cobrar con QR fijo, configurá MERCADOPAGO_EXTERNAL_POS_ID (external_id del POS) en backend/.env.'
  };
}

/** Cuenta vinculada al Access Token (sin exponer el token). */
export async function obtenerCuentaVinculada() {
  if (!mercadopagoConfigurado()) {
    return { configurado: false, cuenta: null };
  }
  const token = accessToken();
  const me = await mpJson(`${MP_API}/users/me`, { token });
  const email = String(me?.email || '');
  const nickname = String(me?.nickname || '');
  const esPrueba =
    /testuser/i.test(email) ||
    /testuser/i.test(nickname) ||
    /^TEST/i.test(nickname) ||
    Boolean(me?.tags?.includes?.('test_user'));

  return {
    configurado: true,
    cuenta: {
      id: me?.id ?? null,
      nickname: nickname || null,
      email: email || null,
      nombre: [me?.first_name, me?.last_name].filter(Boolean).join(' ').trim() || null,
      es_prueba: esPrueba
    }
  };
}

/** Inicio/fin del día en zona Argentina (UTC-3). */
function rangoDiaArgentina(fechaISO) {
  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(String(fechaISO || ''))
    ? String(fechaISO)
    : fechaLocalISO();
  const beginLocal = `${fecha}T00:00:00.000-03:00`;
  const [y, m, d] = fecha.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d) + 24 * 60 * 60 * 1000);
  const y2 = next.getUTCFullYear();
  const m2 = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d2 = String(next.getUTCDate()).padStart(2, '0');
  const endLocal = `${y2}-${m2}-${d2}T00:00:00.000-03:00`;
  return { fecha, begin_date: beginLocal, end_date: endLocal };
}

/** Solo transferencias que llegaron a esta cuenta (no las que enviaste). */
function esTransferenciaRecibida(p, collectorId) {
  const op = String(p.operation_type || '');
  const poi = String(p.point_of_interaction?.type || '');
  const esTransfer =
    op === 'money_transfer' ||
    poi === 'PSP_TRANSFER' ||
    String(p.payment_type_id || '') === 'bank_transfer';
  if (!esTransfer) return false;
  const collector = p.collector_id ?? p.collector?.id;
  return collector != null && String(collector) === String(collectorId);
}

function mapTransferencia(p) {
  const estado = String(p.status || '');
  const monto = round2(p.transaction_amount);
  const neto = round2(p.transaction_details?.net_received_amount ?? monto);
  const pagadorNombre =
    [p.payer?.first_name, p.payer?.last_name].filter(Boolean).join(' ').trim() || null;
  const pagadorEmail = p.payer?.email || null;
  // Preferir nombre si MP lo envía; si no, el correo.
  const pagador = pagadorNombre || pagadorEmail || p.payer?.identification?.number || null;

  return {
    id: `pay-${p.id}`,
    origen: 'transferencia',
    fecha: p.date_approved || p.date_created,
    fecha_creado: p.date_created,
    fecha_aprobado: p.date_approved,
    estado,
    estado_label: LABELS_ESTADO[estado] || estado,
    tipo: 'transferencia',
    tipo_label: 'Transferencia recibida',
    metodo: String(p.payment_method_id || p.payment_type_id || 'account_money'),
    descripcion:
      p.description && p.description !== 'Varios' ? p.description : 'Transferencia recibida',
    referencia: p.external_reference || null,
    monto,
    monto_neto: neto,
    moneda: p.currency_id || 'ARS',
    cuotas: Number(p.installments || 1),
    pagador,
    pagador_nombre: pagadorNombre,
    pagador_email: pagadorEmail,
    operation_type: p.operation_type || null
  };
}

async function buscarTransferenciasRecibidas({
  fecha,
  status = 'approved',
  limit = 50,
  token,
  collectorId
}) {
  const { begin_date, end_date } = rangoDiaArgentina(fecha);
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 50);
  const todos = [];
  let offset = 0;
  let totalApi = null;

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({
      sort: 'date_created',
      criteria: 'desc',
      range: 'date_created',
      begin_date,
      end_date,
      limit: String(lim),
      offset: String(offset)
    });
    if (status && status !== 'todos') params.set('status', status);

    const body = await mpJson(`${MP_API}/v1/payments/search?${params}`, { token });
    const results = Array.isArray(body?.results) ? body.results : [];
    totalApi = body?.paging?.total ?? totalApi;
    for (const p of results) {
      if (esTransferenciaRecibida(p, collectorId)) todos.push(mapTransferencia(p));
    }

    offset += results.length;
    if (results.length < lim) break;
    if (totalApi != null && offset >= totalApi) break;
  }

  return todos.sort(
    (a, b) => new Date(b.fecha || 0).getTime() - new Date(a.fecha || 0).getTime()
  );
}

/**
 * Solo transferencias recibidas del día (no enviadas ni cobros Checkout/tarjeta).
 * Solo lectura. No consulta saldo ni permite enviar dinero.
 */
export async function listarMovimientos({ fecha, status = 'approved', limit = 50 } = {}) {
  const token = accessToken();
  const { fecha: fechaDia } = rangoDiaArgentina(fecha);
  const me = await mpJson(`${MP_API}/users/me`, { token });
  const collectorId = me?.id;
  if (!collectorId) {
    throw new Error('No se pudo identificar la cuenta de Mercado Pago vinculada al Access Token.');
  }

  const movimientos = await buscarTransferenciasRecibidas({
    fecha: fechaDia,
    status,
    limit,
    token,
    collectorId
  });

  const totalMonto = round2(movimientos.reduce((s, x) => s + Number(x.monto || 0), 0));

  return {
    fecha: fechaDia,
    status: status || 'approved',
    cantidad: movimientos.length,
    total_monto: totalMonto,
    por_tipo: [
      {
        tipo: 'transferencia',
        label: 'Transferencia recibida',
        cantidad: movimientos.length,
        total: totalMonto
      }
    ].filter((t) => t.cantidad > 0),
    movimientos,
    fuentes: {
      transferencias_recibidas: movimientos.length
    },
    enlace_actividad: 'https://www.mercadopago.com.ar/activities'
  };
}
