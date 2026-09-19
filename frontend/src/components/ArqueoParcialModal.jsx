import { useEffect, useMemo, useState } from 'react'
import { X, ClipboardList, RefreshCw } from 'lucide-react'
import { cierreCajaAPI } from '../services/api'
import { hoyLocalISO } from '../utils/fechas'
import { claseMontoNeto, extraRubroCierre, fmtMoney, SUBTITULO_RUBROS_CIERRE } from '../utils/cierreCajaDisplay'

const labels = {
  efectivo: 'EFECTIVO',
  transferencia: 'TRANSFERENCIA',
  tarjeta: 'TARJETA',
  fiado: 'FIADO',
  sin_definir: 'SIN DEFINIR'
}

const labelsProv = {
  efectivo: 'EFECTIVO',
  transferencia: 'TRANSFERENCIA'
}

const TarjetaMetodo = ({ titulo, subtitulo, metodos, keys, negativo = false }) => (
  <div className="space-y-2">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{titulo}</p>
      {subtitulo && <p className="text-[11px] text-gray-400">{subtitulo}</p>}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {keys.map((key) => {
        const m = metodos[key] || {}
        const total = negativo ? Number(m.total || 0) : Number(m.neto ?? m.total ?? 0)
        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">{labels[key] || labelsProv[key] || key}</p>
            <p className={`text-lg font-bold mt-1 ${negativo ? 'text-red-600' : claseMontoNeto(total)}`}>
              {negativo && total > 0 ? `-${fmtMoney(total)}` : fmtMoney(total)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{m.movimientos || 0} mov.</p>
          </div>
        )
      })}
    </div>
  </div>
)

/**
 * Solo consulta el resumen de caja (mismo API que cierre). No guarda ni cierra turno.
 */
const ArqueoParcialModal = ({ open, onClose }) => {
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const fecha = hoyLocalISO()

  const ventasMetodos = useMemo(() => resumen?.metodos || {}, [resumen])
  const proveedoresMetodos = useMemo(() => resumen?.pagosProveedores?.metodos || {}, [resumen])
  const listaProveedores = useMemo(() => resumen?.pagosProveedores?.lista || [], [resumen])
  const listaRetiros = useMemo(() => resumen?.retirosEfectivo?.lista || [], [resumen])
  const listaIngresos = useMemo(() => resumen?.ingresosEfectivo?.lista || [], [resumen])
  const keysVentas = Object.keys(labels)

  const cargar = async () => {
    setLoading(true)
    setError(null)
    try {
      const { data } = await cierreCajaAPI.getResumen(fecha)
      setResumen(data)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudo cargar el arqueo')
      setResumen(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    cargar()
  }, [open])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[min(92vh,900px)] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="arqueo-titulo"
      >
        <div className="px-5 py-4 border-b border-gray-200 bg-white flex items-start justify-between gap-3 shrink-0">
          <div>
            <h3 id="arqueo-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ClipboardList className="text-brand-600" size={22} />
              Arqueo parcial
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Control del turno · {fecha} · no cierra la caja ni guarda nada
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cargar}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-300 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
              aria-label="Cerrar"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading && !resumen ? (
            <div className="text-center text-gray-500 py-16">Cargando resumen…</div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3">{error}</div>
          ) : (
            <>
              {resumen?.esCierreParcialDelDia && resumen?.desdeUltimoCierre && (
                <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                  <strong>Desde el último cierre:</strong>{' '}
                  {new Date(resumen.desdeUltimoCierre).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  })}
                  . Solo se muestran movimientos posteriores.
                </div>
              )}

              <TarjetaMetodo
                titulo="Ingresos por método"
                subtitulo="Ventas + cobros de fiados (neto por medio)"
                metodos={ventasMetodos}
                keys={keysVentas}
              />

              <TarjetaMetodo
                titulo="Pagos a proveedores"
                subtitulo="Egresos (se restan en el neto)"
                metodos={proveedoresMetodos}
                keys={Object.keys(labelsProv)}
                negativo
              />

              {Array.isArray(resumen?.rubros?.lista) && resumen.rubros.lista.length > 0 && (
                <div className="space-y-2">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      Discriminación de rubros
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {SUBTITULO_RUBROS_CIERRE}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
                    {resumen.rubros.lista.map((r) => (
                      <div
                        key={r.key}
                        className={`rounded-xl border p-3 ${
                          r.key === 'pedidos_ya'
                            ? 'bg-rose-50 border-rose-200'
                            : 'bg-white border-violet-200'
                        }`}
                      >
                        <p className="text-xs text-gray-500 font-semibold">{r.label}</p>
                        <p className={`text-lg font-bold mt-1 tabular-nums ${
                          r.key === 'pedidos_ya' ? 'text-rose-900' : 'text-violet-900'
                        }`}>
                          {fmtMoney(r.total)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {r.movimientos || 0} mov. · {Number(r.unidades || 0).toLocaleString('es-ES', {
                            maximumFractionDigits: 3
                          })}{' '}
                          u.
                        </p>
                        {extraRubroCierre(r) ? (
                          <p className="text-[11px] text-rose-800 mt-1">{extraRubroCierre(r)}</p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {listaProveedores.length > 0 && (
                <div className="bg-white rounded-xl border border-red-100 p-4">
                  <p className="text-sm font-semibold text-red-900 mb-3">
                    Detalle pagos a proveedores ({listaProveedores.length})
                  </p>
                  <ul className="space-y-2 text-sm">
                    {listaProveedores.map((p) => (
                      <li
                        key={p.id}
                        className="flex flex-wrap justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                      >
                        <span className="text-gray-800">
                          <strong>{p.proveedor}</strong>
                          {p.concepto ? ` — ${p.concepto}` : ''}
                        </span>
                        <span className="font-semibold text-red-700">{fmtMoney(p.monto_total)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(listaRetiros.length > 0 || Number(resumen?.totalGeneralRetiros) > 0) && (
                <div className="bg-white rounded-xl border border-orange-100 p-4">
                  <p className="text-sm font-semibold text-orange-900 mb-1">
                    Retiros de efectivo ({listaRetiros.length})
                  </p>
                  <p className="text-[11px] text-gray-500 mb-3">Se restan del neto del turno</p>
                  {listaRetiros.length > 0 ? (
                    <ul className="space-y-2 text-sm mb-3">
                      {listaRetiros.map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                        >
                          <span className="text-gray-800">
                            <strong>{r.metodo_pago || 'efectivo'}</strong>
                            {r.motivo ? ` — ${r.motivo}` : ''}
                            <span className="text-xs text-gray-500 ml-1">({r.registrado_por || '—'})</span>
                          </span>
                          <span className="font-semibold text-orange-700">{fmtMoney(r.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-right text-sm font-bold text-orange-800">
                    Total retiros: -{fmtMoney(resumen?.totalGeneralRetiros || 0).replace('$', '')}
                  </p>
                </div>
              )}

              {(listaIngresos.length > 0 || Number(resumen?.totalGeneralIngresosEfectivo) > 0) && (
                <div className="bg-white rounded-xl border border-sky-100 p-4">
                  <p className="text-sm font-semibold text-sky-900 mb-1">
                    Ingresos de efectivo ({listaIngresos.length})
                  </p>
                  <p className="text-[11px] text-gray-500 mb-3">Se suman al efectivo del turno</p>
                  {listaIngresos.length > 0 ? (
                    <ul className="space-y-2 text-sm mb-3">
                      {listaIngresos.map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                        >
                          <span className="text-gray-800">
                            <strong>efectivo</strong>
                            {r.motivo ? ` — ${r.motivo}` : ''}
                            <span className="text-xs text-gray-500 ml-1">({r.registrado_por || '—'})</span>
                          </span>
                          <span className="font-semibold text-sky-700">{fmtMoney(r.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-right text-sm font-bold text-sky-800">
                    Total ingresos: +{fmtMoney(resumen?.totalGeneralIngresosEfectivo || 0).replace('$', '')}
                  </p>
                </div>
              )}

              <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Ventas (movimientos)</p>
                    <p className="text-2xl font-bold text-gray-900">{resumen?.totalMovimientos || 0}</p>
                  </div>
                  <div className="flex flex-wrap gap-6 sm:justify-end">
                    <div>
                      <p className="text-sm text-gray-500">Total ventas</p>
                      <p className="text-xl font-bold text-emerald-700">
                        {fmtMoney(resumen?.totalGeneralVentas || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total proveedores</p>
                      <p className="text-xl font-bold text-red-600">
                        -{fmtMoney(resumen?.totalGeneralProveedores || 0).replace('$', '')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total retiros</p>
                      <p className="text-xl font-bold text-orange-700">
                        -{fmtMoney(resumen?.totalGeneralRetiros || 0).replace('$', '')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Total ingresos</p>
                      <p className="text-xl font-bold text-sky-700">
                        +{fmtMoney(resumen?.totalGeneralIngresosEfectivo || 0).replace('$', '')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Neto</p>
                      <p className={`text-3xl font-extrabold ${claseMontoNeto(resumen?.totalGeneralNeto)}`}>
                        {fmtMoney(resumen?.totalGeneralNeto || 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-200 bg-white flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-semibold text-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}

export default ArqueoParcialModal
