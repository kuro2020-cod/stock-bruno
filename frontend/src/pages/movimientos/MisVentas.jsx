import { useEffect, useMemo, useState } from 'react'
import { ShoppingBag, Search } from 'lucide-react'
import { movimientosAPI } from '../../services/api'
import {
  parsePagosDesglose,
  consolidarPromosEnMovimientos
} from '../../utils/movimientosPromo'
import { hoyLocalISO } from '../../utils/fechas'

const hoyISO = hoyLocalISO

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtDate = (d) => {
  const x = new Date(d)
  if (Number.isNaN(x.getTime())) return '-'
  return x.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const precioVentaMov = (m) => {
  if (m.tipo !== 'salida') return null
  const n = Number(m.precio_unitario)
  return Number.isFinite(n) ? n : null
}

const importeSalida = (m) => {
  if (m._esPromoAgrupada && m._importePromo != null) return Number(m._importePromo)
  const p = precioVentaMov(m)
  if (p == null) return null
  const q = Number(m.cantidad)
  if (!Number.isFinite(q)) return null
  return q * p
}

/** Incluye líneas mixtas que tengan ese medio en el desglose. */
function movimientoCoincideFiltroMetodo(m, filtro) {
  if (filtro === 'todos') return true
  if (filtro === 'sin-definir') return !m.metodo_pago
  if (filtro === 'mixto') return m.metodo_pago === 'mixto'
  const p = parsePagosDesglose(m)
  if (p && Number(p[filtro]) > 0) return true
  return m.metodo_pago === filtro
}

const ETIQUETA_METODO = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado',
  sin_definir: 'Sin definir'
}

const ORDEN_METODO = ['efectivo', 'transferencia', 'tarjeta', 'fiado', 'sin_definir']

function textoMetodoPago(m) {
  if (!m.metodo_pago) return '—'
  if (m.metodo_pago === 'mixto') {
    const p = parsePagosDesglose(m)
    if (p && typeof p === 'object') {
      const parts = Object.entries(p)
        .filter(([, v]) => Number(v) > 0)
        .map(
          ([k, v]) =>
            `${(ETIQUETA_METODO[k] || k)} ${fmtMoney(Number(v))}`
        )
      return parts.length ? parts.join(' · ') : 'Mixto'
    }
    return 'Mixto'
  }
  return (ETIQUETA_METODO[m.metodo_pago] || m.metodo_pago).toString()
}

const MisVentas = () => {
  const [ventas, setVentas] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterMetodoPago, setFilterMetodoPago] = useState('todos')
  const [fechaDesde, setFechaDesde] = useState(() => hoyISO())
  const [fechaHasta, setFechaHasta] = useState(() => hoyISO())

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await movimientosAPI.getMisVentas({ limit: 10000 })
        setVentas(Array.isArray(data) ? data : [])
      } catch (error) {
        console.error('Error al cargar mis ventas:', error)
        alert(error.response?.data?.error || 'No se pudieron cargar tus ventas')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const ventasFiltradas = useMemo(() => {
    let out = [...ventas]

    if (searchTerm.trim()) {
      const t = searchTerm.trim().toLowerCase()
      out = out.filter(
        (m) =>
          m.producto_nombre?.toLowerCase().includes(t) ||
          m.producto_codigo?.toLowerCase().includes(t) ||
          m.promo_nombre?.toLowerCase().includes(t) ||
          m.motivo?.toLowerCase().includes(t)
      )
    }

    if (filterMetodoPago !== 'todos') {
      out = out.filter((m) => movimientoCoincideFiltroMetodo(m, filterMetodoPago))
    }

    if (fechaDesde) {
      const desde = new Date(`${fechaDesde}T00:00:00`)
      out = out.filter((m) => {
        const f = new Date(m.fecha)
        return !Number.isNaN(f.getTime()) && f >= desde
      })
    }
    if (fechaHasta) {
      const hasta = new Date(`${fechaHasta}T23:59:59.999`)
      out = out.filter((m) => {
        const f = new Date(m.fecha)
        return !Number.isNaN(f.getTime()) && f <= hasta
      })
    }

    return consolidarPromosEnMovimientos(out)
  }, [ventas, searchTerm, filterMetodoPago, fechaDesde, fechaHasta])

  const total = useMemo(
    () => ventasFiltradas.reduce((s, m) => s + (importeSalida(m) || 0), 0),
    [ventasFiltradas]
  )

  const totalesPorMetodo = useMemo(() => {
    const acc = {}
    for (const m of ventasFiltradas) {
      const imp = importeSalida(m)
      if (imp == null || imp <= 0) continue

      if (m.metodo_pago === 'mixto') {
        const p = parsePagosDesglose(m)
        if (p && typeof p === 'object') {
          for (const [k, raw] of Object.entries(p)) {
            const n = Number(raw)
            if (Number.isFinite(n) && n > 0) {
              const key = String(k).toLowerCase()
              acc[key] = (acc[key] || 0) + n
            }
          }
          continue
        }
      }

      const met =
        m.metodo_pago && String(m.metodo_pago).trim()
          ? String(m.metodo_pago).toLowerCase()
          : 'sin_definir'
      acc[met] = (acc[met] || 0) + imp
    }
    return acc
  }, [ventasFiltradas])

  const filasTotalesMetodo = useMemo(() => {
    return Object.entries(totalesPorMetodo)
      .filter(([, v]) => v > 0.0001)
      .sort(([a], [b]) => {
        const ia = ORDEN_METODO.indexOf(a)
        const ib = ORDEN_METODO.indexOf(b)
        if (ia === -1 && ib === -1) return a.localeCompare(b)
        if (ia === -1) return 1
        if (ib === -1) return -1
        return ia - ib
      })
  }, [totalesPorMetodo])

  if (loading) {
    return <div className="text-center py-12 text-gray-600">Cargando tus ventas...</div>
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="page-title">
          <ShoppingBag className="text-brand-600" size={32} />
          Mis ventas
        </h2>
        <p className="text-gray-600 mt-2">Historial de ventas registradas con tu usuario.</p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="lg:col-span-2">
            <label className="text-xs text-gray-600 mb-1 block">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="text"
                placeholder="Producto, código o motivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Método de pago</label>
            <select
              value={filterMetodoPago}
              onChange={(e) => setFilterMetodoPago(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="todos">Todos</option>
              <option value="efectivo">EFECTIVO</option>
              <option value="transferencia">TRANSFERENCIA</option>
              <option value="tarjeta">TARJETA</option>
              <option value="fiado">FIADO</option>
              <option value="mixto">MIXTO</option>
              <option value="sin-definir">Sin definir</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              max={hoyISO()}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <label className="text-xs text-gray-600 mb-1 block">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              max={hoyISO()}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 border-b">
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
            <p className="text-sm text-gray-600 flex flex-wrap items-baseline gap-x-1.5 gap-y-1">
              <span>{ventasFiltradas.length} venta(s)</span>
              <span className="text-gray-300">·</span>
              <span>
                Total:{' '}
                <span className="font-semibold text-emerald-700 tabular-nums">{fmtMoney(total)}</span>
              </span>
            </p>
            {filasTotalesMetodo.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {filasTotalesMetodo.map(([key, val]) => (
                  <span
                    key={key}
                    title={`Total ${ETIQUETA_METODO[key] || key}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border-2 border-emerald-500 bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-950 shadow-sm ring-1 ring-emerald-200/80"
                  >
                    <span className="uppercase tracking-wide text-[10px] text-emerald-800">
                      {ETIQUETA_METODO[key] || key}
                    </span>
                    <span className="tabular-nums text-sm">{fmtMoney(val)}</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
        {ventasFiltradas.length === 0 ? (
          <div className="py-12 text-center text-gray-600">No hay ventas para los filtros seleccionados.</div>
        ) : (
          <div className="overflow-x-auto max-h-[65vh] overflow-y-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">P. venta</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Importe</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Método</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {ventasFiltradas.map((m) => (
                  <tr key={m.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{fmtDate(m.fecha)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {m._esPromoAgrupada ? (
                        <span>
                          <span className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-800">
                            Promo
                          </span>
                          {m.producto_nombre}
                        </span>
                      ) : (
                        m.producto_nombre
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{m.producto_codigo || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-900">
                      {Number(m.cantidad).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 })}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                      {precioVentaMov(m) != null ? fmtMoney(precioVentaMov(m)) : '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-800">
                      {importeSalida(m) != null ? fmtMoney(importeSalida(m)) : '—'}
                    </td>
                    <td
                      className="px-6 py-4 text-sm text-gray-700 max-w-[14rem]"
                      title={textoMetodoPago(m)}
                    >
                      <span className="line-clamp-2">{textoMetodoPago(m)}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{m.motivo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

export default MisVentas
