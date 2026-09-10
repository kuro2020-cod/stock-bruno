import { useEffect, useState } from 'react'
import { estadisticasAPI } from '../services/api'
import { DollarSign, Package, TrendingUp, Calendar, Users } from 'lucide-react'

const PERIODOS = [
  { value: 'dia', label: 'Día', descripcion: 'Movimientos de salida registrados hoy' },
  { value: 'semana', label: 'Semana', descripcion: 'Semana calendario actual (lun–dom)' },
  { value: 'mes', label: 'Mes', descripcion: 'Elegí el mes en el selector (incluye meses anteriores)' }
]

function mesActualYYYYMM() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtUnidades = (n) =>
  Number(n).toLocaleString('es-ES', { minimumFractionDigits: 0, maximumFractionDigits: 3 })

const nombreCompleto = (row) =>
  row.usuario_id == null ? row.nombre : [row.apellido, row.nombre].filter(Boolean).join(', ')

const Estadisticas = () => {
  const [periodo, setPeriodo] = useState('dia')
  const [mesSeleccionado, setMesSeleccionado] = useState(mesActualYYYYMM)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const mesParam = periodo === 'mes' ? mesSeleccionado : undefined
        const res = await estadisticasAPI.getVentas(periodo, mesParam)
        if (!cancelled) setData(res.data)
      } catch (e) {
        if (!cancelled) {
          setError(e.response?.data?.error || 'No se pudieron cargar las estadísticas')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [periodo, mesSeleccionado])

  const meta = PERIODOS.find((p) => p.value === periodo)

  return (
    <div>
      <header className="page-header">
        <h2 className="page-title flex items-center gap-3">
          <TrendingUp className="text-brand-600" size={28} />
          Estadísticas
        </h2>
        <p className="page-subtitle">Ingresos y unidades vendidas por período y por usuario.</p>
      </header>
      <div className="flex flex-col gap-4 mb-8">
        <div className="flex flex-col sm:flex-row sm:items-end sm:flex-wrap gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
              <Calendar size={16} />
              Período
            </label>
            <div className="flex flex-wrap gap-1 rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              {PERIODOS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPeriodo(p.value)}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    periodo === p.value ? 'bg-brand-600 text-white shadow-soft' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          {periodo === 'mes' && (
            <div>
              <label
                htmlFor="estad-mes"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Mes
              </label>
              <input
                id="estad-mes"
                type="month"
                value={mesSeleccionado}
                max={mesActualYYYYMM()}
                onChange={(e) => setMesSeleccionado(e.target.value)}
                className="px-3 py-2 rounded-lg border border-gray-300 text-gray-900 bg-white focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          )}
          {meta && (
            <p className="text-sm text-gray-500 sm:pb-2 sm:max-w-md">{meta.descripcion}</p>
          )}
        </div>
      </div>

      {loading && <div className="text-center py-16 text-gray-600">Cargando estadísticas…</div>}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 mb-6">{error}</div>
      )}

      {!loading && data && (
        <>
          <div className="mb-2 flex items-center gap-2 text-blue-800 font-medium">
            <TrendingUp size={20} />
            {data.etiqueta}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
            <div className="bg-white rounded-xl shadow border border-gray-100 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Ingresos por ventas</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{fmtMoney(data.ingresosVentas)}</p>
                </div>
                <div className="bg-emerald-500 p-3 rounded-xl">
                  <DollarSign className="text-white" size={26} />
                </div>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow border border-gray-100 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">Unidades vendidas</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">
                    {Number(data.unidadesVendidas).toLocaleString('es-ES', {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 3
                    })}
                  </p>
                </div>
                <div className="bg-blue-500 p-3 rounded-xl">
                  <Package className="text-white" size={26} />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden mb-10">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Users size={20} className="text-brand-600" />
                Ventas por usuario
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                Todos los usuarios del sistema y cuánto vendieron en el período seleccionado
              </p>
            </div>
            {data.ventasPorUsuario && data.ventasPorUsuario.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-6 py-3 w-10">#</th>
                      <th className="px-6 py-3">Usuario</th>
                      <th className="px-6 py-3">Login</th>
                      <th className="px-6 py-3">Rol</th>
                      <th className="px-6 py-3 text-right">Unidades</th>
                      <th className="px-6 py-3 text-right">Total vendido</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.ventasPorUsuario.map((row, i) => (
                      <tr
                        key={row.usuario_id ?? 'sin-asignar'}
                        className={`hover:bg-gray-50 ${row.total_ventas > 0 ? '' : 'text-gray-500'}`}
                      >
                        <td className="px-6 py-3 text-sm text-gray-400 font-medium">{i + 1}</td>
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{nombreCompleto(row)}</td>
                        <td className="px-6 py-3 text-sm text-gray-600 font-mono">{row.login}</td>
                        <td className="px-6 py-3 text-sm">
                          {row.rol ? (
                            <span
                              className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                                row.rol === 'ADMIN'
                                  ? 'bg-violet-100 text-violet-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {row.rol === 'ADMIN' ? 'Admin' : 'Vendedor'}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-6 py-3 text-sm text-right font-semibold text-gray-800">
                          {fmtUnidades(row.unidades_vendidas)}
                        </td>
                        <td className="px-6 py-3 text-sm text-right text-emerald-700 font-medium">
                          {fmtMoney(row.total_ventas)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-gray-500">No hay usuarios registrados en el sistema.</div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
              <h3 className="text-lg font-semibold text-gray-800">Productos más vendidos</h3>
              <p className="text-sm text-gray-500 mt-1">Ordenados por cantidad de unidades en salidas del período</p>
            </div>
            {data.topProductos && data.topProductos.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      <th className="px-6 py-3 w-10">#</th>
                      <th className="px-6 py-3">Producto</th>
                      <th className="px-6 py-3">Código</th>
                      <th className="px-6 py-3 text-right">Unidades</th>
                      <th className="px-6 py-3 text-right">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.topProductos.map((row, i) => (
                      <tr key={row.producto_id} className="hover:bg-gray-50">
                        <td className="px-6 py-3 text-sm text-gray-400 font-medium">{i + 1}</td>
                        <td className="px-6 py-3 text-sm font-medium text-gray-900">{row.nombre}</td>
                        <td className="px-6 py-3 text-sm text-gray-600 font-mono">{row.codigo || '—'}</td>
                        <td className="px-6 py-3 text-sm text-right font-semibold text-gray-800">
                          {Number(row.unidades_vendidas).toLocaleString('es-ES', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3
                          })}
                        </td>
                        <td className="px-6 py-3 text-sm text-right text-emerald-700 font-medium">
                          {fmtMoney(row.ingresos_estimados)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="px-6 py-12 text-center text-gray-500">
                No hay ventas (salidas) registradas en este período.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default Estadisticas
