import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Truck, Plus, Trash2 } from 'lucide-react'
import { pagosProveedoresAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { hoyLocalISO } from '../utils/fechas'

const METODOS = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' }
]

const ITEMS_PAGE = 5

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const parseMonto = (v) => {
  const s = String(v ?? '').trim().replace(',', '.')
  if (!s) return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

const etiquetaMetodo = (pago) => {
  if (pago.metodo_pago === 'mixto' && pago.pagos_desglose) {
    const obj =
      typeof pago.pagos_desglose === 'string'
        ? (() => {
            try {
              return JSON.parse(pago.pagos_desglose)
            } catch {
              return {}
            }
          })()
        : pago.pagos_desglose
    return Object.entries(obj)
      .filter(([, v]) => Number(v) > 0)
      .map(([k, v]) => `${METODOS.find((m) => m.key === k)?.label || k}: ${fmtMoney(v)}`)
      .join(' + ')
  }
  return METODOS.find((m) => m.key === pago.metodo_pago)?.label || pago.metodo_pago
}

const etiquetaRangoFechas = (desde, hasta) => {
  if (desde && hasta && desde === hasta) return desde
  if (desde && hasta) return `${desde} al ${hasta}`
  if (desde) return `desde ${desde}`
  if (hasta) return `hasta ${hasta}`
  return 'todas las fechas'
}

const PagoProveedores = () => {
  const { user } = useAuth()
  const esAdmin = user?.rol === 'ADMIN'
  const [desde, setDesde] = useState(() => hoyLocalISO())
  const [hasta, setHasta] = useState(() => hoyLocalISO())
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [page, setPage] = useState(1)

  const [proveedor, setProveedor] = useState('')
  const [concepto, setConcepto] = useState('')
  const [montoTotal, setMontoTotal] = useState('')
  const [pagoCombinado, setPagoCombinado] = useState(false)
  const [metodoPago, setMetodoPago] = useState('efectivo')
  const [montosPago, setMontosPago] = useState({ efectivo: '', transferencia: '' })

  const cargar = useCallback(async () => {
    setLoading(true)
    try {
      const params = {}
      if (desde && hasta && desde === hasta) {
        params.fecha = desde
      } else {
        if (desde) params.desde = desde
        if (hasta) params.hasta = hasta
      }
      const { data } = await pagosProveedoresAPI.listar(params)
      setLista(Array.isArray(data) ? data : [])
      setPage(1)
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudieron cargar los pagos')
      setLista([])
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  useEffect(() => {
    cargar()
  }, [cargar])

  const totalPeriodo = useMemo(
    () => lista.reduce((s, p) => s + Number(p.monto_total || 0), 0),
    [lista]
  )

  const totalPages = Math.max(1, Math.ceil(lista.length / ITEMS_PAGE))
  const pageSafe = Math.min(page, totalPages)
  const startIndex = (pageSafe - 1) * ITEMS_PAGE
  const listaPagina = lista.slice(startIndex, startIndex + ITEMS_PAGE)

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const resetForm = () => {
    setProveedor('')
    setConcepto('')
    setMontoTotal('')
    setPagoCombinado(false)
    setMetodoPago('efectivo')
    setMontosPago({ efectivo: '', transferencia: '' })
  }

  const registrar = async (e) => {
    e.preventDefault()
    const monto = parseMonto(montoTotal)
    if (!proveedor.trim()) {
      alert('Indicá el nombre del proveedor')
      return
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      alert('El monto debe ser mayor a 0')
      return
    }

    let body = {
      proveedor: proveedor.trim(),
      concepto: concepto.trim() || undefined,
      monto_total: monto
    }

    if (pagoCombinado) {
      const entries = []
      for (const { key } of METODOS) {
        const v = parseMonto(montosPago[key])
        if (Number.isNaN(v)) {
          alert('Revise los importes: use números válidos')
          return
        }
        if (v > 0) entries.push({ metodo: key, monto: v })
      }
      if (entries.length < 2) {
        alert('Con pago combinado, indicá al menos dos medios con importe mayor a 0')
        return
      }
      const suma = Math.round(entries.reduce((s, x) => s + x.monto, 0) * 100) / 100
      if (Math.abs(suma - monto) > 0.05) {
        alert(`La suma de los medios (${fmtMoney(suma)}) debe coincidir con el total (${fmtMoney(monto)})`)
        return
      }
      body = { ...body, pagos: entries }
    } else {
      body = { ...body, metodo_pago: metodoPago }
    }

    setSubmitting(true)
    try {
      await pagosProveedoresAPI.registrar(body)
      resetForm()
      const hoy = hoyLocalISO()
      setDesde(hoy)
      setHasta(hoy)
      await cargar()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo registrar el pago')
    } finally {
      setSubmitting(false)
    }
  }

  const eliminar = async (id) => {
    if (!window.confirm('¿Eliminar este pago a proveedor?')) return
    try {
      await pagosProveedoresAPI.eliminar(id)
      await cargar()
    } catch (err) {
      alert(err.response?.data?.error || 'No se pudo eliminar')
    }
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-8">
        <h2 className="page-title">
          <Truck className="text-brand-600" size={32} />
          Pago de proveedores
        </h2>
        <p className="text-gray-600 mt-2">
          Registrá egresos por efectivo o transferencia. Se descontarán del cierre de caja del día (el efectivo puede
          quedar negativo).
        </p>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6">
        <form onSubmit={registrar} className="space-y-4">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Plus size={18} className="text-brand-600" />
            Nuevo pago
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Proveedor *</label>
              <input
                type="text"
                value={proveedor}
                onChange={(e) => setProveedor(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                required
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Monto total *</label>
              <input
                type="text"
                inputMode="decimal"
                value={montoTotal}
                onChange={(e) => setMontoTotal(e.target.value)}
                placeholder="0.00"
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
                required
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-gray-600">Concepto (opcional)</label>
              <input
                type="text"
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder="Ej. Factura #1234, mercadería"
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 bg-gray-50/50">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={pagoCombinado}
                onChange={(e) => setPagoCombinado(e.target.checked)}
                className="rounded border-gray-300"
              />
              Pago combinado (efectivo + transferencia)
            </label>

            {pagoCombinado ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                {METODOS.map(({ key, label }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-600">{label}</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={montosPago[key]}
                      onChange={(e) => setMontosPago((prev) => ({ ...prev, [key]: e.target.value }))}
                      placeholder="0.00"
                      className="w-full mt-1 px-3 py-2 border rounded-lg text-sm bg-white"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-3 mt-3">
                {METODOS.map(({ key, label }) => (
                  <label
                    key={key}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm ${
                      metodoPago === key
                        ? 'border-brand-500 bg-brand-50 text-brand-800 font-medium'
                        : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="metodoPago"
                      value={key}
                      checked={metodoPago === key}
                      onChange={() => setMetodoPago(key)}
                      className="sr-only"
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2.5 rounded-lg bg-brand-600 text-white font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            {submitting ? 'Registrando...' : 'Registrar pago'}
          </button>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-4">Historial de pagos</h3>
          <div className="flex flex-col sm:flex-row flex-wrap gap-4 items-end">
            <div>
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Calendar size={14} />
                Desde
              </label>
              <input
                type="date"
                value={desde}
                max={hasta || hoyLocalISO()}
                onChange={(e) => setDesde(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <Calendar size={14} />
                Hasta
              </label>
              <input
                type="date"
                value={hasta}
                min={desde || undefined}
                max={hoyLocalISO()}
                onChange={(e) => setHasta(e.target.value)}
                className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
              />
            </div>
            <button
              type="button"
              onClick={cargar}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm"
            >
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => {
                const hoy = hoyLocalISO()
                setDesde(hoy)
                setHasta(hoy)
              }}
              className="px-4 py-2 rounded-lg text-sm text-gray-600 hover:bg-gray-100"
            >
              Hoy
            </button>
            <div className="rounded-lg bg-red-50 border border-red-100 px-4 py-2 sm:ml-auto">
              <p className="text-xs text-red-700">Total del período</p>
              <p className="text-lg font-bold text-red-800">{fmtMoney(totalPeriodo)}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-gray-500">
            {loading
              ? 'Cargando…'
              : `${lista.length} pago(s) — ${etiquetaRangoFechas(desde, hasta)}`}
          </p>
        </div>

        {loading ? (
          <p className="text-center text-gray-500 py-10">Cargando...</p>
        ) : lista.length === 0 ? (
          <p className="text-center text-gray-500 py-10">No hay pagos registrados para el período seleccionado.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Hora</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">Concepto</th>
                    <th className="px-4 py-3">Método</th>
                    <th className="px-4 py-3 text-right">Monto</th>
                    <th className="px-4 py-3">Registró</th>
                    {esAdmin && <th className="px-4 py-3 w-12" />}
                  </tr>
                </thead>
                <tbody>
                  {listaPagina.map((p) => (
                    <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {p.fecha
                          ? new Date(p.fecha).toLocaleDateString('es-AR', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                        {p.fecha
                          ? new Date(p.fecha).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
                          : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{p.proveedor}</td>
                      <td className="px-4 py-3 text-gray-600">{p.concepto || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{etiquetaMetodo(p)}</td>
                      <td className="px-4 py-3 text-right font-semibold text-red-700">{fmtMoney(p.monto_total)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">{p.registrado_por || '—'}</td>
                      {esAdmin && (
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => eliminar(p.id)}
                            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50"
                            title="Eliminar"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-600">
                  Mostrando {lista.length === 0 ? 0 : startIndex + 1} a{' '}
                  {Math.min(startIndex + ITEMS_PAGE, lista.length)} de {lista.length}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
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
                    onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
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
    </div>
  )
}

export default PagoProveedores
