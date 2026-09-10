import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BookUser,
  CheckCircle2,
  AlertCircle,
  Search,
  ChevronDown,
  ChevronRight,
  ShoppingCart,
  AlertTriangle
} from 'lucide-react'
import { fiadosAPI } from '../services/api'
import { lineasCarritoDesdeFiados } from '../utils/fiadoCarrito'
import { fmtCantidadStock } from '../utils/unidades'
import { useAuth } from '../context/AuthContext'
import { esAccesoLimitado } from '../utils/acceso'

const METODO_COBRO_LABEL = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  mixto: 'Mixto'
}

const labelMetodoCobro = (pago) => {
  const desglose = pago?.pagos_desglose
  if (desglose && typeof desglose === 'object') {
    const partes = Object.entries(desglose)
      .filter(([, v]) => Number(v) > 0.009)
      .map(([k, v]) => `${METODO_COBRO_LABEL[k] || k} ${fmtMoney(v)}`)
    if (partes.length) return partes.join(' · ')
  }
  return METODO_COBRO_LABEL[pago?.metodo_cobro] || pago?.metodo_cobro || 'Pago'
}

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtFechaHora = (fecha) => {
  if (!fecha) return '—'
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return String(fecha)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const Fiados = () => {
  const navigate = useNavigate()
  const { user } = useAuth()
  const sinVentas = esAccesoLimitado(user)
  const [resumen, setResumen] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [mensaje, setMensaje] = useState(null)
  const [expandido, setExpandido] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [rResumen, rList] = await Promise.all([
        fiadosAPI.resumen(),
        fiadosAPI.listar({ estado: 'pendiente', limit: 300 })
      ])
      setResumen(Array.isArray(rResumen.data) ? rResumen.data : [])
      setMovimientos(Array.isArray(rList.data) ? rList.data : [])
    } catch (e) {
      setMensaje({
        tipo: 'error',
        texto: e.response?.data?.error || 'No se pudieron cargar los fiados'
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const filtro = q.trim().toLowerCase()
  const resumenFiltrado = useMemo(() => {
    if (!filtro) return resumen
    return resumen.filter((r) => String(r.cliente_nombre || '').toLowerCase().includes(filtro))
  }, [resumen, filtro])

  const movsPorCliente = useMemo(() => {
    const m = new Map()
    for (const row of movimientos) {
      const key = String(row.cliente_nombre || '').trim().toLowerCase()
      if (!m.has(key)) m.set(key, [])
      m.get(key).push(row)
    }
    return m
  }, [movimientos])

  const totalPendiente = useMemo(
    () => resumenFiltrado.reduce((s, r) => s + Number(r.total_debe || 0), 0),
    [resumenFiltrado]
  )

  const cobrarEnVentas = (fiadosLista) => {
    const lista = Array.isArray(fiadosLista) ? fiadosLista : [fiadosLista]
    const lineas = lineasCarritoDesdeFiados(lista)
    if (!lineas.length) {
      setMensaje({
        tipo: 'error',
        texto:
          'Este fiado no tiene productos asociados. No se puede cargar en ventas para cobrar.'
      })
      return
    }
    navigate('/ventas', {
      state: {
        cobrarFiados: {
          lineas,
          cliente: lista[0]?.cliente_nombre || ''
        }
      }
    })
  }

  const cobrarUno = (m) => cobrarEnVentas([m])

  const cobrarCliente = (r) => {
    const key = String(r.cliente_nombre || '').trim().toLowerCase()
    const movs = movsPorCliente.get(key) || []
    if (!movs.length) {
      setMensaje({ tipo: 'error', texto: 'No hay fiados pendientes para esta persona.' })
      return
    }
    cobrarEnVentas(movs)
  }

  return (
    <div>
      <header className="page-header mb-6">
        <h2 className="page-title mb-1 flex items-center gap-2">
          <BookUser className="text-amber-700 dark:text-amber-400" size={28} />
          Fiados
        </h2>
        <p className="text-sm text-gray-600 dark:text-slate-400 max-w-2xl">
          Personas con saldo pendiente
          {sinVentas
            ? '.'
            : '. Con Cobrar en ventas se cargan los productos en el carrito para cobrar como una venta normal y sumar más productos en el mismo ticket.'}
        </p>
      </header>

      {mensaje && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            mensaje.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/40 dark:text-emerald-100'
              : 'border-red-200 bg-red-50 text-red-900 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-100'
          }`}
        >
          {mensaje.tipo === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>{mensaje.texto}</span>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar persona…"
            className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm bg-white dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100"
          />
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm dark:border-amber-500/40 dark:bg-amber-950/30">
          <span className="text-amber-900/80 dark:text-amber-200/90">Total pendiente:</span>{' '}
          <strong className="text-amber-950 tabular-nums dark:text-amber-100">{fmtMoney(totalPendiente)}</strong>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-slate-400">Cargando…</p>
      ) : resumenFiltrado.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500 text-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-400">
          No hay fiados pendientes.
        </div>
      ) : (
        <div className="space-y-3">
          {resumenFiltrado.map((r) => {
            const key = String(r.cliente_nombre || '').trim().toLowerCase()
            const movs = movsPorCliente.get(key) || []
            const abierto = Boolean(expandido[key])
            const tieneAvisoCarrito = movs.some((m) => m.aviso_carrito_texto)
            return (
              <div
                key={key}
                className="rounded-xl border border-amber-200 bg-white shadow-sm overflow-hidden dark:border-amber-500/30 dark:bg-slate-900"
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    className="flex items-center gap-2 text-left flex-1 min-w-0"
                    onClick={() =>
                      setExpandido((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                  >
                    {abierto ? (
                      <ChevronDown size={18} className="text-amber-700 dark:text-amber-400 shrink-0" />
                    ) : (
                      <ChevronRight size={18} className="text-amber-700 dark:text-amber-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                        {r.cliente_nombre}
                        {tieneAvisoCarrito && (
                          <AlertTriangle size={14} className="text-orange-600 dark:text-orange-300 shrink-0" title="Fiado eliminado del carrito sin cobrar" />
                        )}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-slate-400">
                        {r.compras} compra(s) · Última: {fmtFechaHora(r.ultima_compra)}
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-2 sm:ml-auto flex-wrap justify-end">
                    <p className="text-lg font-bold text-amber-900 dark:text-amber-200 tabular-nums">
                      {fmtMoney(r.total_debe)}
                    </p>
                    {!sinVentas && (
                    <button
                      type="button"
                      onClick={() => cobrarCliente(r)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <ShoppingCart size={14} />
                      Cobrar en ventas
                    </button>
                    )}
                  </div>
                </div>
                {abierto && (
                  <div className="border-t border-amber-100 bg-amber-50/40 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-950/20">
                    {movs.length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-slate-400">Sin detalle.</p>
                    ) : (
                      <ul className="space-y-2">
                        {movs.map((m) => (
                          <li
                            key={m.id}
                            className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-lg border border-amber-100 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/80"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-gray-900 dark:text-slate-100 tabular-nums">
                                Saldo {fmtMoney(m.monto)}
                                {m.monto_compra != null && Number(m.monto_compra) - Number(m.monto) > 0.05 && (
                                  <span className="ml-2 text-xs font-normal text-gray-500 dark:text-slate-400">
                                    (compra {fmtMoney(m.monto_compra)})
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-gray-500 dark:text-slate-400">{fmtFechaHora(m.fecha)}</p>
                              {Array.isArray(m.items) && m.items.length > 0 ? (
                                <ul className="mt-1.5 space-y-0.5">
                                  {m.items.map((it, idx) => (
                                    <li
                                      key={`${m.id}-${it.producto_id}-${idx}`}
                                      className="text-xs text-gray-600 dark:text-slate-300"
                                    >
                                      {it.nombre}
                                      {it.promo_nombre ? ` [${it.promo_nombre}]` : ''} ·{' '}
                                      {fmtCantidadStock(it.cantidad, it.unidad_medida)} × {fmtMoney(it.precio_unitario)} ={' '}
                                      {fmtMoney(it.subtotal)}
                                      {it.precio_cambio && it.precio_unitario_viejo != null && (
                                        <span className="text-amber-700 dark:text-amber-300">
                                          {' '}
                                          (antes {fmtMoney(it.precio_unitario_viejo)})
                                        </span>
                                      )}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                m.detalle && (
                                  <p className="text-xs text-gray-600 dark:text-slate-300 mt-0.5 line-clamp-2">{m.detalle}</p>
                                )
                              )}
                              {Array.isArray(m.pagos_parciales) && m.pagos_parciales.length > 0 && (
                                <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-2 dark:border-emerald-500/40 dark:bg-emerald-950/40">
                                  <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
                                    Pagos a cuenta
                                  </p>
                                  <ul className="mt-1 space-y-0.5">
                                    {m.pagos_parciales.map((pago, idx) => (
                                      <li
                                        key={`${m.id}-pago-${idx}`}
                                        className="text-xs text-emerald-950 dark:text-emerald-100 tabular-nums"
                                      >
                                        {fmtFechaHora(pago.fecha)} · {labelMetodoCobro(pago)} · −{fmtMoney(pago.monto)}
                                        {pago.cobrado_por ? (
                                          <span className="text-emerald-800/80 dark:text-emerald-200/80">
                                            {' '}
                                            · {pago.cobrado_por}
                                          </span>
                                        ) : null}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {m.precios_actualizados && (
                                <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1">
                                  Monto actualizado según precios vigentes de los productos.
                                </p>
                              )}
                              {m.aviso_carrito_texto && (
                                <div className="mt-2 flex items-start gap-1.5 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-2 text-xs text-orange-950 dark:border-orange-500/50 dark:bg-orange-950/50 dark:text-orange-50">
                                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-orange-600 dark:text-orange-300" />
                                  <div>
                                    <p className="font-semibold text-orange-950 dark:text-orange-50">
                                      {m.aviso_carrito_texto}
                                    </p>
                                    {m.aviso_carrito_at && (
                                      <p className="text-[10px] text-orange-800/80 dark:text-orange-200/90 mt-0.5">
                                        {fmtFechaHora(m.aviso_carrito_at)}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {m.registrado_por && (
                                <p className="text-[10px] text-gray-400 dark:text-slate-500 mt-0.5">
                                  Por: {m.registrado_por}
                                </p>
                              )}
                            </div>
                            {!sinVentas && (
                            <button
                              type="button"
                              onClick={() => cobrarUno(m)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 self-start"
                            >
                              <ShoppingCart size={14} />
                              Cobrar en ventas
                            </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default Fiados
