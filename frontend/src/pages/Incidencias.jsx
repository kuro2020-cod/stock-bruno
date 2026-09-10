import { useCallback, useEffect, useState } from 'react'
import { incidenciasAPI } from '../services/api'
import { fmtMoney } from '../utils/promociones'
import { hoyLocalISO } from '../utils/fechas'
import { AlertTriangle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'

const ITEMS_PAGE = 10

const etiquetaTipoIncidencia = (tipo) => {
  switch (tipo) {
    case 'carrito':
      return 'Carrito completo'
    case 'fiado':
      return 'Fiado descartado'
    case 'fiado_carrito':
      return 'Fiado quitado del carrito'
    default:
      return 'Producto eliminado'
  }
}

const claseTipoIncidencia = (tipo) => {
  switch (tipo) {
    case 'carrito':
      return 'bg-red-100 text-red-800'
    case 'fiado':
    case 'fiado_carrito':
      return 'bg-amber-100 text-amber-900'
    default:
      return 'bg-amber-100 text-amber-900'
  }
}

const fmtFechaHora = (fecha) => {
  if (!fecha) return '—'
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return String(fecha)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const Incidencias = () => {
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(1)

  const totalPages = Math.max(1, Math.ceil(total / ITEMS_PAGE))
  const pageSafe = Math.min(Math.max(1, page), totalPages)
  const start = total === 0 ? 0 : (pageSafe - 1) * ITEMS_PAGE
  const end = Math.min(start + rows.length, total)

  const load = useCallback(async (pageToLoad = 1, filtros = {}) => {
    setLoading(true)
    setError(null)
    const p = Math.max(1, pageToLoad)
    try {
      const { data } = await incidenciasAPI.listar({
        limit: ITEMS_PAGE,
        offset: (p - 1) * ITEMS_PAGE,
        ...(filtros.desde ? { desde: filtros.desde } : {}),
        ...(filtros.hasta ? { hasta: filtros.hasta } : {})
      })
      const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : []
      const tot = Number(data?.total ?? items.length) || 0
      setRows(items)
      setTotal(tot)
      setPage(p)
    } catch (e) {
      setError(e.response?.data?.error || 'No se pudieron cargar las incidencias')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load(1, { desde, hasta })
    // Solo al montar; filtros se aplican con el botón
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const aplicarFiltros = () => {
    if (desde && hasta && desde > hasta) {
      setError('La fecha "Desde" no puede ser posterior a "Hasta".')
      return
    }
    load(1, { desde, hasta })
  }

  const limpiarFechas = () => {
    setDesde('')
    setHasta('')
    load(1, { desde: '', hasta: '' })
  }

  const irPagina = (p) => {
    const next = Math.min(Math.max(1, p), totalPages)
    load(next, { desde, hasta })
  }

  return (
    <div>
      <header className="page-header flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="page-title flex items-center gap-3">
            <AlertTriangle className="text-amber-600" size={28} />
            Incidencias
          </h2>
          <p className="page-subtitle">
            Registro de productos eliminados del carrito, fiados descartados al cobrar o carritos vaciados.
          </p>
        </div>
        <button
          type="button"
          onClick={() => load(pageSafe, { desde, hasta })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
        >
          <RefreshCw size={16} />
          Actualizar
        </button>
      </header>

      <div className="bg-white rounded-xl shadow border border-gray-100 p-4 mb-6">
        <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600">Desde</label>
            <input
              type="date"
              value={desde}
              max={hoyLocalISO()}
              onChange={(e) => setDesde(e.target.value)}
              className="block w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Hasta</label>
            <input
              type="date"
              value={hasta}
              max={hoyLocalISO()}
              onChange={(e) => setHasta(e.target.value)}
              className="block w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
            />
          </div>
          <button
            type="button"
            onClick={aplicarFiltros}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium"
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={limpiarFechas}
            className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
          >
            Limpiar fechas
          </button>
        </div>
        <p className="mt-3 text-sm text-gray-500">
          {loading ? 'Cargando…' : `${total} incidencia(s) encontrada(s)`}
        </p>
      </div>

      {loading && <div className="text-center py-16 text-gray-600">Cargando incidencias…</div>}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 mb-6">{error}</div>
      )}

      {!loading && !error && total === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center text-gray-500">
          No hay incidencias para los filtros seleccionados.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="space-y-4 mb-6">
            {rows.map((row) => (
              <article
                key={row.id}
                className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden"
              >
                <div className="px-5 py-4 border-b border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${claseTipoIncidencia(row.tipo)}`}
                    >
                      {etiquetaTipoIncidencia(row.tipo)}
                    </span>
                    <span className="text-sm text-gray-600">{fmtFechaHora(row.fecha)}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Usuario</p>
                    <p className="text-sm font-medium text-gray-900">{row.registrado_por || '—'}</p>
                  </div>
                </div>

                <div className="px-5 py-4">
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                          <th className="pb-2 pr-3">Producto</th>
                          <th className="pb-2 pr-3">Código</th>
                          <th className="pb-2 pr-3 text-right">Cant.</th>
                          <th className="pb-2 pr-3 text-right">P. unit.</th>
                          <th className="pb-2 text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {(row.detalle || []).map((it, idx) => (
                          <tr key={`${row.id}-${idx}`}>
                            <td className="py-2 pr-3 font-medium text-gray-900">
                              {it.nombre}
                              {it.es_cobro_fiado && (
                                <span className="ml-2 text-[10px] font-semibold text-amber-900 bg-amber-100 px-1.5 py-0.5 rounded">
                                  Fiado
                                </span>
                              )}
                              {it.es_linea_promo && (
                                <span className="ml-2 text-[10px] font-semibold text-violet-800 bg-violet-100 px-1.5 py-0.5 rounded">
                                  Promo
                                </span>
                              )}
                            </td>
                            <td className="py-2 pr-3 font-mono text-gray-600 text-xs">{it.codigo || '—'}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{it.cantidad}</td>
                            <td className="py-2 pr-3 text-right tabular-nums">{fmtMoney(it.precio_unitario)}</td>
                            <td className="py-2 text-right tabular-nums font-medium text-emerald-700">
                              {fmtMoney(it.subtotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(row.tipo === 'fiado' || row.tipo === 'fiado_carrito') &&
                    row.detalle?.[0]?.fiado_cliente && (
                      <p className="mt-3 text-sm text-amber-900">
                        Cliente: <strong>{row.detalle[0].fiado_cliente}</strong>
                      </p>
                    )}
                  <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between items-center">
                    <span className="text-sm text-gray-500">Monto total eliminado</span>
                    <span className="text-lg font-bold text-red-700 tabular-nums">
                      {fmtMoney(row.monto_total)}
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 py-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Mostrando {start + 1} a {end} de {total}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => irPagina(pageSafe - 1)}
                  disabled={pageSafe <= 1 || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronLeft size={16} />
                  Anterior
                </button>
                <span className="text-sm text-gray-700 tabular-nums px-2">
                  {pageSafe} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => irPagina(pageSafe + 1)}
                  disabled={pageSafe >= totalPages || loading}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 hover:bg-gray-50"
                >
                  Siguiente
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Incidencias
