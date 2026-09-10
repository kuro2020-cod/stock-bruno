import nodemailer from 'nodemailer';
import { Faltante } from '../models/Faltante.js';
import { Producto } from '../models/Producto.js';
import { ConfigReporteFaltantes } from '../models/ConfigReporteFaltantes.js';
import { generarPdfFaltantes, generarPdfStockBajo } from './reportesPdf.js';

const TZ = 'America/Argentina/Buenos_Aires';

export function hoyArgentinaISO() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

export function fechaLabelEs(isoYYYYMMDD) {
  const [y, m, d] = String(isoYYYYMMDD).split('-');
  if (!y || !m || !d) return isoYYYYMMDD;
  return `${d}/${m}/${y}`;
}

export function smtpConfigurado() {
  return Boolean(
    process.env.SMTP_HOST &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
  );
}

function crearTransport() {
  if (!smtpConfigurado()) {
    throw new Error(
      'SMTP no configurado. Definí SMTP_HOST, SMTP_USER y SMTP_PASS en el archivo .env del backend.'
    );
  }
  const port = Number(process.env.SMTP_PORT) || 587;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

/**
 * Genera PDFs y envía el correo.
 * @param {{ forzar?: boolean }} opts forzar=true ignora flag `activo` (botón Enviar ahora)
 */
export async function enviarReporteFaltantes({ forzar = false } = {}) {
  const config = await ConfigReporteFaltantes.get();
  if (!forzar && !config.activo) {
    return { omitido: true, motivo: 'Reporte desactivado en configuración.' };
  }

  const fecha = hoyArgentinaISO();
  const label = fechaLabelEs(fecha);

  const [faltantes, stockBajo] = await Promise.all([
    Faltante.listar({ desde: fecha, hasta: fecha, limit: 2000 }),
    Producto.getLowStock()
  ]);

  const [pdfFaltantes, pdfStock] = await Promise.all([
    generarPdfFaltantes({ fechaLabel: label, filas: faltantes }),
    generarPdfStockBajo({ fechaLabel: label, filas: stockBajo })
  ]);

  const destinos = ConfigReporteFaltantes.parseEmails(config.email_destino);
  if (!destinos.length) {
    throw new Error('No hay correos destino configurados.');
  }

  const transport = crearTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const info = await transport.sendMail({
    from,
    to: destinos,
    subject: `Reporte stock — ${label}`,
    text: [
      `Reporte automático del ${label}.`,
      '',
      `Faltantes del día: ${faltantes.length}`,
      `Productos con stock bajo: ${stockBajo.length}`,
      '',
      'Se adjuntan 2 PDF: faltantes y stock bajo.'
    ].join('\n'),
    attachments: [
      {
        filename: `faltantes-${fecha}.pdf`,
        content: pdfFaltantes,
        contentType: 'application/pdf'
      },
      {
        filename: `stock-bajo-${fecha}.pdf`,
        content: pdfStock,
        contentType: 'application/pdf'
      }
    ]
  });

  const destinosLabel = destinos.join(', ');
  console.log(
    `[reporte-faltantes] Enviado a ${destinosLabel} (${faltantes.length} faltantes, ${stockBajo.length} stock bajo). messageId=${info.messageId}`
  );

  return {
    ok: true,
    email_destino: destinosLabel,
    emails: destinos,
    fecha,
    faltantes: faltantes.length,
    stock_bajo: stockBajo.length,
    messageId: info.messageId
  };
}

/**
 * PDF de pedido (misma vista que stock bajo) al correo configurado en faltantes/stock bajo.
 * @param {{ items: Array<{ id?: any, producto_id?: any, cantidad: any }> }} opts
 */
export async function enviarPedidoEmail({ items } = {}) {
  const config = await ConfigReporteFaltantes.get();
  const destinos = ConfigReporteFaltantes.parseEmails(config.email_destino);
  if (!destinos.length) {
    throw new Error('No hay correos destino configurados en Faltantes / stock bajo.');
  }

  const raw = Array.isArray(items) ? items : [];
  const porId = new Map();
  const filasManuales = [];
  for (const it of raw) {
    const qty = Number(String(it.cantidad ?? '').toString().replace(',', '.'));
    if (!Number.isFinite(qty) || qty <= 0) continue;

    const esManual = Boolean(it.manual) || it.id == null || it.id === '';
    const id = Number(it.id ?? it.producto_id);
    if (!esManual && Number.isFinite(id) && id > 0) {
      porId.set(id, qty);
      continue;
    }

    const nombre = String(it.nombre || '').trim();
    if (!nombre) continue;
    filasManuales.push({
      nombre: `${nombre} (nuevo)`,
      categoria_nombre: String(it.categoria_nombre || it.categoria || '').trim() || 'Sin categoría',
      stock_actual: qty,
      unidad_medida: it.unidad_medida || 'unidad'
    });
  }
  if (!porId.size && !filasManuales.length) {
    throw new Error('No hay productos con cantidad para armar el pedido.');
  }

  const catalogo = await Producto.getAll();
  const filas = [];
  for (const p of catalogo) {
    const qty = porId.get(Number(p.id));
    if (qty == null) continue;
    const codigo = String(p.codigo || '').trim().toUpperCase();
    if (codigo === 'ENVASE' || codigo.startsWith('REINICIO-')) continue;
    filas.push({
      nombre: p.nombre,
      categoria_nombre: p.categoria_nombre,
      stock_actual: qty,
      unidad_medida: p.unidad_medida
    });
  }
  filas.push(...filasManuales);
  if (!filas.length) {
    throw new Error('Ningún producto del pedido es válido.');
  }

  const fecha = hoyArgentinaISO();
  const label = fechaLabelEs(fecha);
  const pdf = await generarPdfStockBajo({
    fechaLabel: label,
    filas,
    titulo: 'Pedido'
  });

  const transport = crearTransport();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  const info = await transport.sendMail({
    from,
    to: destinos,
    subject: `Pedido — ${label}`,
    text: [
      `Pedido del ${label}.`,
      '',
      `Productos: ${filas.length}`,
      '',
      'Se adjunta el PDF del pedido (ordenado por categoría, misma vista que stock bajo).'
    ].join('\n'),
    attachments: [
      {
        filename: `pedido-${fecha}.pdf`,
        content: pdf,
        contentType: 'application/pdf'
      }
    ]
  });

  const destinosLabel = destinos.join(', ');
  console.log(
    `[pedido] Enviado a ${destinosLabel} (${filas.length} productos). messageId=${info.messageId}`
  );

  return {
    ok: true,
    email_destino: destinosLabel,
    emails: destinos,
    fecha,
    productos: filas.length,
    messageId: info.messageId
  };
}
