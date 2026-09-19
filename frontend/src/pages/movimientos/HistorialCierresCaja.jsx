import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { cierreCajaAPI } from '../../services/api'
import { ArrowLeft, ChevronDown, FileDown } from 'lucide-react'
import {
  fmtMoney,
  hoyISO,
  labelsCierre,
  parseDetalleCierre,
  filasTablaMetodosHtml,
  bloqueRubrosHtml,
  bloqueAperturaCajaHtml,
  formatFechaCaja
} from './cierreHelpers'
import { esDetalleCierreV2, claseMontoNeto, extraRubroCierre, lineasRubrosCierre, formatAperturaCajaHora } from '../../utils/cierreCajaDisplay'

const ITEMS_PAGE = 20

/** Genera un PDF a partir del nodo del comprobante (misma vista que en pantalla). */
async function descargarComoPdf(cardElement, filenameBase) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf')
  ])
  const canvas = await html2canvas(cardElement, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: '#ffffff'
  })
  const imgData = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
  const pdfWidth = pdf.internal.pageSize.getWidth()
  const pdfHeight = pdf.internal.pageSize.getHeight()
  const imgWidth = pdfWidth
  const imgHeight = (canvas.height * imgWidth) / canvas.width
  let heightLeft = imgHeight
  let position = 0

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
  heightLeft -= pdfHeight

  while (heightLeft > 0) {
    position = heightLeft - imgHeight
    pdf.addPage()
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pdfHeight
  }

  pdf.save(`${filenameBase}.pdf`)
}

const HistorialCierresCaja = () => {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [abiertos, setAbiertos] = useState(() => new Set())

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (desde) params.desde = desde
      if (hasta) params.hasta = hasta
      const { data } = await cierreCajaAPI.lista(params)
      setLista(Array.isArray(data) ? data : [])
      setPage(1)
      setAbiertos(new Set())
    } catch (e) {
      console.error(e)
      setLista([])
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totalPages = Math.max(1, Math.ceil(lista.length / ITEMS_PAGE))
  const pageSafe = Math.min(page, totalPages)
  const start = (pageSafe - 1) * ITEMS_PAGE
  const pagina = lista.slice(start, start + ITEMS_PAGE)

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const abrirVentanaHtml = (html, filenameBase = 'cierre-caja') => {
    const w = window.open('', '_blank')
    if (!w) {
      alert('Permití ventanas emergentes para ver el PDF')
      return
    }
    w.document.write(html)
    w.document.close()
    w.focus()
    w.onload = () => {
      const btnPrint = w.document.getElementById('btn-print')
      const btnDownload = w.document.getElementById('btn-download')
      if (btnPrint) {
        btnPrint.onclick = () => w.print()
      }
      if (btnDownload) {
        btnDownload.onclick = async () => {
          const card = w.document.querySelector('.card')
          if (!card) return
          const labelOk = btnDownload.textContent
          try {
            btnDownload.disabled = true
            btnDownload.textContent = 'Generando PDF…'
            await descargarComoPdf(card, filenameBase)
          } catch (e) {
            console.error(e)
            alert('No se pudo generar el PDF. Probá de nuevo o usá «Imprimir / PDF».')
          } finally {
            btnDownload.disabled = false
            btnDownload.textContent = labelOk
          }
        }
      }
    }
  }

  const abrirPdfCierre = (cierre, indiceGlobal) => {
    const esc = (s) => String(s ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const det = parseDetalleCierre(cierre.detalle_metodos)
    const filasC = filasTablaMetodosHtml(det)
    const rubrosHtml = bloqueRubrosHtml(det)
    const aperturaHtml = bloqueAperturaCajaHtml(det)
    const obs = cierre.observaciones
      ? `<div class="obs"><strong>Observaciones</strong><p>${esc(cierre.observaciones)}</p></div>`
      : ''
    const hora = cierre.created_at ? new Date(cierre.created_at).toLocaleString('es-AR') : '—'
    const fechaLabel = formatFechaCaja(cierre.fecha_cierre)
    const html = `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Cierre #${indiceGlobal + 1} — ${fechaLabel}</title>
      <style>
        *{box-sizing:border-box;}
        body{
          margin:0;
          min-height:100vh;
          font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
          color:#0f172a;
          background:linear-gradient(160deg,#ecfdf5 0%,#f1f5f9 45%,#e2e8f0 100%);
          line-height:1.5;
          -webkit-font-smoothing:antialiased;
        }
        .toolbar{
          display:flex;
          flex-wrap:wrap;
          gap:10px;
          position:sticky;
          top:0;
          z-index:10;
          padding:14px 20px;
          background:rgba(255,255,255,.92);
          backdrop-filter:blur(8px);
          border-bottom:1px solid #e2e8f0;
          box-shadow:0 1px 0 rgba(255,255,255,.8);
        }
        .toolbar button{
          border:none;
          padding:10px 16px;
          border-radius:10px;
          font-size:13px;
          font-weight:600;
          cursor:pointer;
          letter-spacing:.02em;
          transition:transform .12s ease,box-shadow .12s ease;
        }
        .toolbar button:active{transform:scale(.98);}
        #btn-download{
          background:#fff;
          color:#047857;
          border:1px solid #a7f3d0;
          box-shadow:0 1px 2px rgba(15,23,42,.06);
        }
        #btn-download:hover{background:#ecfdf5;box-shadow:0 2px 8px rgba(4,120,87,.12);}
        #btn-print{
          background:linear-gradient(180deg,#059669 0%,#047857 100%);
          color:#fff;
          box-shadow:0 2px 8px rgba(4,120,87,.35);
        }
        #btn-print:hover{filter:brightness(1.05);box-shadow:0 4px 14px rgba(4,120,87,.4);}
        .wrap{max-width:640px;margin:0 auto;padding:20px 20px 40px;}
        .card{
          background:#fff;
          border-radius:20px;
          overflow:hidden;
          box-shadow:0 4px 6px -1px rgba(15,23,42,.08),0 20px 40px -12px rgba(15,23,42,.15);
          border:1px solid rgba(226,232,240,.9);
        }
        .card-hd{
          background:linear-gradient(135deg,#059669 0%,#047857 50%,#065f46 100%);
          color:#fff;
          padding:28px 24px 24px;
          position:relative;
        }
        .card-hd::after{
          content:"";
          position:absolute;
          bottom:0;left:0;right:0;
          height:40px;
          background:linear-gradient(to bottom,transparent,rgba(0,0,0,.06));
          pointer-events:none;
        }
        .badge{
          display:inline-block;
          font-size:11px;
          font-weight:700;
          letter-spacing:.12em;
          text-transform:uppercase;
          opacity:.9;
          margin-bottom:8px;
        }
        .card-hd h1{
          margin:0;
          font-size:1.35rem;
          font-weight:700;
          letter-spacing:-.02em;
          line-height:1.25;
        }
        .card-hd .sub{
          margin:10px 0 0;
          font-size:13px;
          opacity:.92;
        }
        .card-bd{padding:24px 24px 28px;}
        .kpis{
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:12px;
          margin-bottom:20px;
        }
        @media(max-width:480px){.kpis{grid-template-columns:1fr;}}
        .kpi{
          background:linear-gradient(180deg,#f8fafc 0%,#f1f5f9 100%);
          border:1px solid #e2e8f0;
          border-radius:14px;
          padding:14px 16px;
        }
        .kpi .lbl{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px;}
        .kpi .val{font-size:1.25rem;font-weight:700;color:#0f172a;}
        .kpi.accent{background:linear-gradient(180deg,#ecfdf5 0%,#d1fae5 100%);border-color:#a7f3d0;}
        .kpi.accent .val{color:#047857;}
        .row-meta{
          font-size:14px;
          color:#475569;
          margin:0 0 6px;
        }
        .row-meta strong{color:#334155;}
        .obs{
          margin:18px 0 0;
          padding:14px 16px;
          background:#fffbeb;
          border:1px solid #fde68a;
          border-radius:12px;
          font-size:14px;
          color:#78350f;
        }
        .obs strong{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#92400e;margin-bottom:6px;}
        .obs p{margin:0;}
        .rubros-wrap{margin-top:20px;}
        .rubros-title{
          margin:0 0 4px;
          font-size:11px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.06em;
          color:#6d28d9;
        }
        .rubros-sub{margin:0 0 10px;font-size:12px;color:#94a3b8;}
        .rubros-grid{
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:10px;
        }
        .rubro{
          background:linear-gradient(180deg,#faf5ff 0%,#f3e8ff 100%);
          border:1px solid #e9d5ff;
          border-radius:12px;
          padding:12px 14px;
          min-width:0;
        }
        .rubro .lbl{font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;overflow-wrap:anywhere;}
        .rubro .val{margin-top:4px;font-size:1.05rem;font-weight:700;color:#5b21b6;font-variant-numeric:tabular-nums;}
        .rubro .meta{margin-top:4px;font-size:11px;color:#64748b;}
        .apertura-wrap{margin:18px 0 4px;}
        .apertura-title{
          margin:0 0 10px;
          font-size:11px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.06em;
          color:#047857;
        }
        .apertura-grid{
          display:grid;
          grid-template-columns:1fr;
          gap:10px;
        }
        @media(min-width:520px){.apertura-grid{grid-template-columns:1fr 1fr 1fr;}}
        .apertura-card{
          background:linear-gradient(180deg,#ecfdf5 0%,#d1fae5 100%);
          border:1px solid #a7f3d0;
          border-radius:12px;
          padding:12px 14px;
        }
        .apertura-card .lbl{font-size:10px;font-weight:700;color:#065f46;text-transform:uppercase;letter-spacing:.04em;}
        .apertura-card .val{margin-top:4px;font-size:1.15rem;font-weight:800;color:#064e3b;font-variant-numeric:tabular-nums;}
        .tbl-wrap{margin-top:8px;border-radius:14px;overflow:hidden;border:1px solid #e2e8f0;}
        table{width:100%;border-collapse:collapse;font-size:14px;}
        thead th{
          background:#f8fafc;
          color:#475569;
          font-size:11px;
          font-weight:700;
          text-transform:uppercase;
          letter-spacing:.05em;
          padding:12px 14px;
          text-align:left;
          border-bottom:1px solid #e2e8f0;
        }
        thead th.num{text-align:right;}
        tbody tr:nth-child(even){background:#fafafa;}
        tbody tr:nth-child(odd){background:#fff;}
        tbody td{
          padding:12px 14px;
          border-bottom:1px solid #f1f5f9;
          color:#1e293b;
        }
        tbody td:first-child{font-weight:600;color:#334155;font-size:13px;}
        tbody tr:last-child td{border-bottom:none;}
        tbody td.num{font-variant-numeric:tabular-nums;text-align:right;font-weight:600;color:#0f172a;}
        tbody td.muted{color:#64748b;font-weight:500;}
        tfoot td{
          padding:14px;
          background:linear-gradient(180deg,#f0fdf4 0%,#ecfdf5 100%);
          border-top:2px solid #a7f3d0;
          font-weight:700;
          font-size:15px;
          color:#065f46;
        }
        tfoot td.num{text-align:right;}
        .foot{
          text-align:center;
          font-size:12px;
          color:#94a3b8;
          margin-top:22px;
          padding-top:16px;
          border-top:1px solid #f1f5f9;
        }
        @media print{
          .toolbar{display:none!important;}
          body{background:#fff;padding:0;}
          .wrap{padding:12px;}
          .card{box-shadow:none;border:1px solid #e2e8f0;}
        }
      </style></head><body>
      <div class="toolbar">
        <button id="btn-download" type="button">Descargar PDF</button>
        <button id="btn-print" type="button">Imprimir / PDF</button>
      </div>
      <div class="wrap">
        <div class="card">
          <div class="card-hd">
            <span class="badge">Cierre de caja</span>
            <h1>Cierre #${indiceGlobal + 1}</h1>
            <p class="sub">Fecha de caja: <strong>${fechaLabel}</strong> · Registrado: ${hora}</p>
          </div>
          <div class="card-bd">
            <div class="kpis">
              <div class="kpi accent">
                <div class="lbl">Total general</div>
                <div class="val">${fmtMoney(cierre.total_general)}</div>
              </div>
              <div class="kpi">
                <div class="lbl">Movimientos</div>
                <div class="val">${cierre.total_movimientos ?? 0}</div>
              </div>
            </div>
            <p class="row-meta"><strong>Cerrado por:</strong> ${esc(cierre.cerrado_por) || '—'}</p>
            ${obs}
            ${aperturaHtml}
            <div class="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Método</th>
                    <th class="num">Importe</th>
                    <th class="num">Mov.</th>
                  </tr>
                </thead>
                <tbody>${filasC}</tbody>
                <tfoot>
                  <tr>
                    <td><strong>Total</strong></td>
                    <td class="num">${fmtMoney(cierre.total_general)}</td>
                    <td class="num">${cierre.total_movimientos ?? 0}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            ${rubrosHtml}
            <p class="foot">Control de Stock — Historial de cierres</p>
          </div>
        </div>
      </div>
      </body></html>`
    abrirVentanaHtml(html, `cierre-caja-${fechaLabel}-n${indiceGlobal + 1}`)
  }

  const totalLista = lista.length

  const indiceGlobal = (i) => start + i

  const toggleAbierto = (id) => {
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          to="/movimientos"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-800"
        >
          <ArrowLeft size={18} />
          Volver al menú de Movimientos
        </Link>
      </div>

      <h2 className="page-title mb-2">Historial de cierres de caja</h2>
      <p className="text-gray-600 mb-6">
        Listado de todos los cierres registrados, del <strong>más reciente al más antiguo</strong>. Sin fechas se
        muestran todos; podés filtrar por fecha de caja.
      </p>

      <div className="bg-white rounded-lg shadow border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600">Desde (fecha caja)</label>
            <input
              type="date"
              value={desde}
              max={hoyISO()}
              onChange={(e) => setDesde(e.target.value)}
              className="block w-full mt-1 px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Hasta (fecha caja)</label>
            <input
              type="date"
              value={hasta}
              max={hoyISO()}
              onChange={(e) => setHasta(e.target.value)}
              className="block w-full mt-1 px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <button
            type="button"
            onClick={cargar}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={() => {
              const hoy = hoyISO()
              setDesde(hoy)
              setHasta(hoy)
            }}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
          >
            Hoy
          </button>
          <button
            type="button"
            onClick={() => {
              setDesde('')
              setHasta('')
            }}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >
            Ver todos
          </button>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          {loading ? 'Cargando…' : `${totalLista} cierre(s) encontrado(s)`}
        </p>
      </div>

      {loading ? (
        <p className="text-center text-gray-500 py-12">Cargando historial…</p>
      ) : totalLista === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-600">
          No hay cierres de caja para los filtros seleccionados.
        </div>
      ) : (
        <>
          <div className="space-y-4 mb-6">
            {pagina.map((c, i) => {
              const det = parseDetalleCierre(c.detalle_metodos)
              const rubros = lineasRubrosCierre(c)
              const ig = indiceGlobal(i)
              const abierto = abiertos.has(c.id)
              return (
                <div
                  key={c.id}
                  className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm shadow-sm"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <div>
                      <span className="font-bold text-emerald-900">#{ig + 1}</span>
                      <span className="text-gray-700 ml-2 font-medium">
                        Fecha caja: {formatFechaCaja(c.fecha_cierre)}
                      </span>
                      <span className="text-gray-600 ml-2 text-sm">
                        {c.created_at ? new Date(c.created_at).toLocaleString('es-AR') : '—'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => abrirPdfCierre(c, ig)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-emerald-600 text-emerald-900 text-xs font-medium hover:bg-emerald-100 self-start"
                    >
                      <FileDown size={14} />
                      Ver PDF
                    </button>
                  </div>
                  <p className="text-emerald-950">
                    <strong>Cerrado por:</strong> {c.cerrado_por || '—'} · <strong>Total:</strong>{' '}
                    {fmtMoney(c.total_general)} · <strong>Mov.:</strong> {c.total_movimientos ?? 0}
                  </p>
                  <button
                    type="button"
                    onClick={() => toggleAbierto(c.id)}
                    className="w-full flex items-center justify-between gap-2 mt-3 pt-3 border-t border-emerald-200/80 text-left"
                    aria-expanded={abierto}
                  >
                    <span className="text-base font-bold uppercase tracking-wide text-emerald-800">
                      {abierto ? 'Ocultar detalle' : 'Ver detalle'}
                    </span>
                    <ChevronDown
                      size={22}
                      className={`shrink-0 text-emerald-800 transition-transform ${
                        abierto ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                  {abierto && (
                    <>
                      {c.observaciones ? (
                        <p className="text-gray-700 text-xs mt-3 italic border-l-2 border-emerald-400 pl-2">
                          {c.observaciones}
                        </p>
                      ) : null}
                      {esDetalleCierreV2(det) ? (
                        <div className="space-y-3 mt-2">
                          {det.apertura_caja && (
                            <div className="rounded-xl border-2 border-emerald-300 bg-emerald-50/80 px-4 py-3.5 text-emerald-950">
                              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800 mb-2">
                                Inicio / fondo de caja
                              </p>
                              {formatAperturaCajaHora(det.apertura_caja) && (
                                <p className="mb-2 text-base sm:text-lg text-emerald-900">
                                  <strong>Apertura de caja:</strong>{' '}
                                  <span className="font-bold tabular-nums">
                                    {formatAperturaCajaHora(det.apertura_caja)}
                                  </span>
                                </p>
                              )}
                              <p className="text-sm sm:text-base leading-relaxed text-emerald-900">
                                Inicio:{' '}
                                <strong className="tabular-nums text-base sm:text-lg text-emerald-950">
                                  {fmtMoney(det.apertura_caja.monto_apertura)}
                                </strong>
                                {' · '}
                                Dejado:{' '}
                                <strong className="tabular-nums text-base sm:text-lg text-emerald-950">
                                  {fmtMoney(det.apertura_caja.fondo_siguiente)}
                                </strong>
                                {' · '}
                                Ajuste efectivo:{' '}
                                <strong
                                  className={`tabular-nums text-base sm:text-lg ${
                                    Number(det.apertura_caja.diferencia_fondo || 0) === 0
                                      ? 'text-emerald-950'
                                      : claseMontoNeto(det.apertura_caja.diferencia_fondo ?? 0)
                                  }`}
                                >
                                  {Number(det.apertura_caja.diferencia_fondo || 0) > 0 ? '+' : ''}
                                  {fmtMoney(
                                    det.apertura_caja.diferencia_fondo ??
                                      Number(det.apertura_caja.monto_apertura || 0) -
                                        Number(det.apertura_caja.fondo_siguiente || 0)
                                  )}
                                </strong>
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-xs font-bold text-emerald-800 uppercase tracking-wide mb-2">
                              Neto por método
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
                              {Object.keys(labelsCierre).map((key) => {
                                const n = det.neto?.[key] || {}
                                const neto = Number(n.neto ?? n.total ?? 0)
                                return (
                                  <div
                                    key={key}
                                    className="rounded-lg border border-emerald-100 bg-white/90 px-3 py-2.5"
                                  >
                                    <p className="text-xs text-gray-500 uppercase font-semibold">
                                      {labelsCierre[key]}
                                    </p>
                                    <p className={`text-base font-bold mt-0.5 ${claseMontoNeto(neto)}`}>
                                      {fmtMoney(neto)}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                      V {fmtMoney(n.ventas ?? 0)} · P -{fmtMoney(n.proveedores ?? 0).replace('$', '')}
                                    </p>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-bold text-red-800 uppercase tracking-wide mb-2">
                              Pagos proveedores
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {['efectivo', 'transferencia'].map((key) => (
                                <div
                                  key={key}
                                  className="rounded-lg border border-red-100 bg-white/90 px-3 py-2.5"
                                >
                                  <p className="text-xs text-gray-500 uppercase font-semibold">
                                    {labelsCierre[key]}
                                  </p>
                                  <p className="text-base font-bold text-red-700 mt-0.5">
                                    -{fmtMoney(det.proveedores?.[key]?.total || 0).replace('$', '')}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                          {rubros.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-violet-800 uppercase tracking-wide mb-2">
                                Discriminación de rubros
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {rubros.map((r) => (
                                  <div
                                    key={r.key}
                                    className="rounded-lg border border-violet-200 bg-white/90 px-3 py-2.5"
                                  >
                                    <p className="text-xs text-gray-500 uppercase font-semibold">{r.label}</p>
                                    <p className="text-base font-bold text-violet-900 tabular-nums mt-0.5">
                                      {fmtMoney(r.total)}
                                    </p>
                                    <p className="text-xs text-gray-600 mt-1">
                                      {r.movimientos || 0} mov. ·{' '}
                                      {Number(r.unidades || 0).toLocaleString('es-ES', {
                                        maximumFractionDigits: 3
                                      })}{' '}
                                      u.
                                    </p>
                                    {extraRubroCierre(r) ? (
                                      <p className="text-[11px] text-rose-800 mt-0.5">{extraRubroCierre(r)}</p>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mt-2">
                          {Object.keys(labelsCierre).map((key) => (
                            <div
                              key={key}
                              className="rounded-lg border border-emerald-100 bg-white/90 px-3 py-2.5"
                            >
                              <p className="text-xs text-gray-500 uppercase font-semibold">
                                {labelsCierre[key]}
                              </p>
                              <p className="text-base font-bold text-gray-900 mt-0.5">
                                {fmtMoney(det[key]?.total || 0)}
                              </p>
                              <p className="text-xs text-gray-600 mt-1">
                                {det[key]?.movimientos ?? 0} mov.
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Mostrando {totalLista === 0 ? 0 : start + 1} a {Math.min(start + ITEMS_PAGE, totalLista)} de{' '}
                {totalLista}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(p - 1, 1))}
                  disabled={pageSafe === 1}
                  className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Anterior
                </button>
                <span className="text-sm text-gray-700">
                  Página {pageSafe} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
                  disabled={pageSafe === totalPages}
                  className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default HistorialCierresCaja
