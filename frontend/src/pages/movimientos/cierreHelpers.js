import { fechaLocalISO, hoyLocalISO } from '../../utils/fechas'
import {
  esDetalleCierreV2,
  METODOS_CIERRE_ORDEN,
  METODOS_PROVEEDOR_ORDEN,
  lineasRubrosCierre,
  formatAperturaCajaHora
} from '../../utils/cierreCajaDisplay'

export const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export const hoyISO = hoyLocalISO
export { fechaLocalISO }

/** Fecha de caja para UI/PDF (evita corrimientos UTC; prioriza YYYY-MM-DD). */
export const formatFechaCaja = (v) => {
  if (v == null || v === '') return '—'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return v.trim()
  const s = String(v)
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m) return m[1]
  const d = v instanceof Date ? v : new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return fechaLocalISO(d)
}

export const labelsCierre = {
  efectivo: 'EFECTIVO',
  transferencia: 'TRANSFERENCIA',
  tarjeta: 'TARJETA',
  fiado: 'FIADO',
  sin_definir: 'SIN DEFINIR'
}

export const parseDetalleCierre = (raw) => {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return raw
}

const fmtNeg = (n) => {
  const v = Number(n || 0)
  const cls = v < 0 ? ' style="color:#dc2626"' : ''
  return `<span class="num"${cls}>${fmtMoney(v)}</span>`
}

/** Bloque HTML de rubros discriminados para el PDF del cierre. */
export const bloqueRubrosHtml = (detalle) => {
  const rubros = lineasRubrosCierre({ detalle_metodos: detalle })
  if (!rubros.length) return ''

  const cards = rubros
    .map(
      (r) => `
      <div class="rubro">
        <div class="lbl">${r.label}</div>
        <div class="val">${fmtMoney(r.total)}</div>
        <div class="meta">${r.movimientos || 0} mov. · ${Number(r.unidades || 0).toLocaleString('es-ES', {
          maximumFractionDigits: 3
        })} u.</div>
      </div>`
    )
    .join('')

  return `
    <div class="rubros-wrap">
      <p class="rubros-title">Discriminación de rubros</p>
      <p class="rubros-sub">Milanesas (incluye sandwich y rollitos), cigarrillos, café máquina y electrónica</p>
      <div class="rubros-grid">${cards}</div>
    </div>`
}

/** Bloque HTML de apertura / fondo dejado para el PDF del cierre. */
export const bloqueAperturaCajaHtml = (detalle) => {
  const ap = detalle?.apertura_caja
  if (!ap || (ap.monto_apertura == null && ap.fondo_siguiente == null)) return ''

  const diff =
    ap.diferencia_fondo != null
      ? Number(ap.diferencia_fondo)
      : Number(ap.monto_apertura || 0) - Number(ap.fondo_siguiente || 0)
  const diffCls = diff < 0 ? ' style="color:#dc2626"' : diff > 0 ? ' style="color:#0369a1"' : ''
  const horaApertura = formatAperturaCajaHora(ap)
  const horaHtml = horaApertura
    ? `<p class="apertura-hora"><strong>Apertura de caja:</strong> ${horaApertura}</p>`
    : ''

  return `
    <div class="apertura-wrap">
      <p class="apertura-title">Inicio y cierre de caja</p>
      ${horaHtml}
      <div class="apertura-grid">
        <div class="apertura-card">
          <div class="lbl">Apertura de caja</div>
          <div class="val">${fmtMoney(ap.monto_apertura || 0)}</div>
        </div>
        <div class="apertura-card">
          <div class="lbl">Cierre / fondo dejado</div>
          <div class="val">${fmtMoney(ap.fondo_siguiente || 0)}</div>
        </div>
        <div class="apertura-card">
          <div class="lbl">Ajuste al efectivo</div>
          <div class="val"${diffCls}>${diff > 0 ? '+' : ''}${fmtMoney(diff)}</div>
        </div>
      </div>
    </div>`
}

export const filasTablaMetodosHtml = (metodosObj) => {
  if (esDetalleCierreV2(metodosObj)) {
    const filasVentas = METODOS_CIERRE_ORDEN.map((k) => {
      const m = metodosObj.ventas?.[k] || {}
      return `<tr>
        <td>${labelsCierre[k]}</td>
        <td class="num">${fmtMoney(m.total || 0)}</td>
        <td class="num">${m.movimientos ?? 0}</td>
      </tr>`
    }).join('')

    const filasProv = METODOS_PROVEEDOR_ORDEN.map((k) => {
      const m = metodosObj.proveedores?.[k] || {}
      return `<tr>
        <td>${labelsCierre[k]}</td>
        <td class="num" style="color:#dc2626">-${fmtMoney(m.total || 0).replace('$', '')}</td>
        <td class="num">${m.movimientos ?? 0}</td>
      </tr>`
    }).join('')

    const filasNeto = METODOS_CIERRE_ORDEN.map((k) => {
      const m = metodosObj.neto?.[k] || {}
      const neto = Number(m.neto ?? m.total ?? 0)
      const ajuste =
        k === 'efectivo' && m.ajuste_fondo != null && Number(m.ajuste_fondo) !== 0
          ? ` <span class="muted">(incl. ajuste fondo ${Number(m.ajuste_fondo) > 0 ? '+' : ''}${fmtMoney(m.ajuste_fondo)})</span>`
          : ''
      return `<tr>
        <td><strong>${labelsCierre[k]}</strong>${ajuste}</td>
        <td>${fmtNeg(neto)}</td>
        <td class="num muted">${m.movimientos ?? 0}</td>
      </tr>`
    }).join('')

    const ap = metodosObj.apertura_caja
    const horaApertura = ap ? formatAperturaCajaHora(ap) : null
    const bloqueApertura =
      ap && (ap.monto_apertura != null || ap.fondo_siguiente != null)
        ? `
      <tr><td colspan="3" style="background:#ecfdf5;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#047857;padding:10px 14px;">Inicio / fondo de caja</td></tr>
      ${
        horaApertura
          ? `<tr>
        <td><strong>Apertura de caja</strong></td>
        <td class="num muted" colspan="2">${horaApertura}</td>
      </tr>`
          : ''
      }
      <tr>
        <td>Inicio de caja</td>
        <td class="num">${fmtMoney(ap.monto_apertura || 0)}</td>
        <td class="num muted">—</td>
      </tr>
      <tr>
        <td>Fondo dejado (siguiente turno)</td>
        <td class="num">${fmtMoney(ap.fondo_siguiente || 0)}</td>
        <td class="num muted">—</td>
      </tr>
      <tr>
        <td><strong>Diferencia (ajuste efectivo)</strong></td>
        <td>${fmtNeg(ap.diferencia_fondo ?? Number(ap.monto_apertura || 0) - Number(ap.fondo_siguiente || 0))}</td>
        <td class="num muted">—</td>
      </tr>`
        : ''

    const totalVentas = METODOS_CIERRE_ORDEN.reduce(
      (s, k) => s + Number(metodosObj.ventas?.[k]?.total ?? 0),
      0
    )
    const totalProv = METODOS_PROVEEDOR_ORDEN.reduce(
      (s, k) => s + Number(metodosObj.proveedores?.[k]?.total ?? 0),
      0
    )
    const totalNeto = METODOS_CIERRE_ORDEN.reduce(
      (s, k) => s + Number(metodosObj.neto?.[k]?.neto ?? metodosObj.neto?.[k]?.total ?? 0),
      0
    )

    return `
      <tr><td colspan="3" style="background:#ecfdf5;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#047857;padding:10px 14px;">Ventas del día</td></tr>
      ${filasVentas}
      <tr><td colspan="3" style="background:#fef2f2;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#b91c1c;padding:10px 14px;">Pagos a proveedores (egreso)</td></tr>
      ${filasProv}
      ${bloqueApertura}
      <tr><td colspan="3" style="background:#f0f9ff;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#0369a1;padding:10px 14px;">Neto por método</td></tr>
      ${filasNeto}
      <tr style="background:#f8fafc;font-weight:700;">
        <td>Resumen</td>
        <td class="num">Ventas ${fmtMoney(totalVentas)} · Prov. -${fmtMoney(totalProv).replace('$', '')}</td>
        <td class="num">${fmtNeg(totalNeto)}</td>
      </tr>`
  }

  return Object.keys(labelsCierre)
    .map((k) => {
      const m = metodosObj?.[k] || {}
      return `<tr>
        <td>${labelsCierre[k]}</td>
        <td class="num">${fmtMoney(m.total || 0)}</td>
        <td class="num">${m.movimientos ?? 0}</td>
      </tr>`
    })
    .join('')
}
