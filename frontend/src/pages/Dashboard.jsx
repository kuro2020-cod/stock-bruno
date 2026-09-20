import { useEffect, useState } from 'react'
import { categoriasAPI, dashboardAPI, dashboardContadoresAPI, productosAPI } from '../services/api'
import { Package, FolderTree, DollarSign, AlertTriangle, TrendingUp, ArrowRight, Plus, X } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmtCantidadStock } from '../utils/unidades'
import { fmtFechaCorta } from '../utils/fechas'
import ContadorCafeMaquina from '../components/ContadorCafeMaquina'
import { ContadorMilanesas, ContadorCigarrillos, ContadorCategoria } from '../components/ContadorMilanesas'

const FRECUENCIAS = [
  { value: 'diario', label: 'Diario (cada día a las 06:00)' },
  { value: 'semanal', label: 'Semanal (cada lunes a las 06:00)' },
  { value: 'mensual', label: 'Mensual (el día 1 a las 06:00)' }
]

/** La alerta destacada de stock bajo solo si hay al menos esta cantidad de productos afectados */
const UMBRAL_ALERTA_STOCK_BAJO = 3

const Dashboard = () => {
  const [stats, setStats] = useState(null)
  const [productosStockBajo, setProductosStockBajo] = useState([])
  const [totalProductosStockBajo, setTotalProductosStockBajo] = useState(0)
  const [productosVencer, setProductosVencer] = useState([])
  const [loading, setLoading] = useState(true)
  const [categorias, setCategorias] = useState([])
  const [modalContador, setModalContador] = useState(false)
  const [formContador, setFormContador] = useState({ categoria_id: '', frecuencia: 'diario' })
  const [guardandoContador, setGuardandoContador] = useState(false)
  const [errorContador, setErrorContador] = useState('')

  useEffect(() => {
    loadStats()
    loadProductosStockBajo()
    loadProductosVencer()
    loadCategorias()
  }, [])

  const loadCategorias = async () => {
    try {
      const response = await categoriasAPI.getAll()
      setCategorias(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error al cargar categorías:', error)
    }
  }

  const loadStats = async () => {
    try {
      const response = await dashboardAPI.getStats()
      setStats(response.data)
    } catch (error) {
      console.error('Error al cargar estadísticas:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadProductosStockBajo = async () => {
    try {
      const response = await productosAPI.getLowStock()
      const lista = response.data || []
      setTotalProductosStockBajo(lista.length)
      setProductosStockBajo(lista.slice(0, 5))
    } catch (error) {
      console.error('Error al cargar productos con stock bajo:', error)
    }
  }

  const loadProductosVencer = async () => {
    try {
      const response = await productosAPI.getVencimientosAlerta()
      setProductosVencer(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error al cargar vencimientos:', error)
    }
  }

  const abrirModalContador = () => {
    setErrorContador('')
    setFormContador({ categoria_id: '', frecuencia: 'diario' })
    setModalContador(true)
  }

  const guardarContador = async (e) => {
    e.preventDefault()
    if (!formContador.categoria_id) {
      setErrorContador('Seleccioná una categoría.')
      return
    }
    setGuardandoContador(true)
    setErrorContador('')
    try {
      await dashboardContadoresAPI.create({
        categoria_id: Number(formContador.categoria_id),
        frecuencia: formContador.frecuencia
      })
      setModalContador(false)
      await loadStats()
    } catch (error) {
      setErrorContador(error.response?.data?.error || 'No se pudo agregar el contador.')
    } finally {
      setGuardandoContador(false)
    }
  }

  const eliminarContador = async (contador) => {
    const nombre = contador?.titulo || contador?.categoriaNombre || 'este contador'
    if (!window.confirm(`¿Quitar el contador de ${nombre}?`)) return
    try {
      await dashboardContadoresAPI.delete(contador.id)
      await loadStats()
    } catch (error) {
      window.alert(error.response?.data?.error || 'No se pudo quitar el contador.')
    }
  }

  const idsUsados = new Set((stats?.contadoresCategoria || []).map((c) => Number(c.categoriaId)))
  const categoriasDisponibles = categorias.filter((c) => !idsUsados.has(Number(c.id)))

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3">
        <div className="loading-spinner" />
        <p className="text-slate-500 text-sm">Cargando dashboard…</p>
      </div>
    )
  }

  const statCards = [
    {
      title: 'Total Productos',
      value: stats?.totalProductos || 0,
      icon: Package,
      gradient: 'from-brand-500 to-indigo-600'
    },
    {
      title: 'Categorías',
      value: stats?.totalCategorias || 0,
      icon: FolderTree,
      gradient: 'from-emerald-500 to-teal-600'
    },
    {
      title: 'Valor Inventario',
      value: `$${Number(stats?.valorInventario || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}`,
      icon: DollarSign,
      gradient: 'from-violet-500 to-purple-600'
    },
    {
      title: 'Stock Bajo',
      value: stats?.stockBajo || 0,
      icon: AlertTriangle,
      gradient: 'from-rose-500 to-orange-500'
    }
  ]

  return (
    <div>
      <header className="page-header">
        <h2 className="page-title">Dashboard</h2>
        <p className="page-subtitle">Resumen general del inventario y la actividad del día.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        {statCards.map((stat, index) => {
          const Icon = stat.icon
          return (
            <div key={index} className="stat-card">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">{stat.title}</p>
                  <p className="text-2xl sm:text-3xl font-bold text-slate-900 mt-2 tabular-nums truncate">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-soft`}
                >
                  <Icon className="text-white" size={22} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold text-slate-800">Contadores de ventas</h3>
          <button type="button" className="btn-primary btn-sm inline-flex items-center gap-1.5" onClick={abrirModalContador}>
            <Plus size={16} />
            Agregar contador
          </button>
        </div>
        <div className="space-y-4">
          {stats?.cafeMaquina?.actual && (
            <ContadorCafeMaquina resumen={stats.cafeMaquina} showHistorial />
          )}
          {stats?.milanesas?.actual && (
            <ContadorMilanesas resumen={stats.milanesas} showHistorial />
          )}
          {stats?.cigarrillos?.actual && (
            <ContadorCigarrillos resumen={stats.cigarrillos} showHistorial />
          )}
          {(stats?.contadoresCategoria || []).map((contador) => (
            <ContadorCategoria
              key={contador.id}
              resumen={contador}
              showHistorial
              onEliminar={() => eliminarContador(contador)}
            />
          ))}
          {!stats?.cafeMaquina?.actual &&
            !stats?.milanesas?.actual &&
            !stats?.cigarrillos?.actual &&
            !(stats?.contadoresCategoria || []).length && (
              <p className="text-sm text-slate-500 bg-white rounded-xl border border-slate-200 px-4 py-6 text-center">
                Todavía no hay un contador agregado. Elegí una categoría y cada cuánto se reinicia.
              </p>
            )}
        </div>
      </div>

      {modalContador && (
        <div
          className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center p-4"
          onClick={() => !guardandoContador && setModalContador(false)}
        >
          <form
            className="modal-panel max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
            onSubmit={guardarContador}
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Agregar contador</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Mostrá las ventas de una categoría y elegí cada cuánto se reinicia el total.
                </p>
              </div>
              <button
                type="button"
                className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100"
                onClick={() => setModalContador(false)}
                disabled={guardandoContador}
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>

            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="contador-categoria">
              Categoría
            </label>
            <select
              id="contador-categoria"
              className="select-field mb-4"
              value={formContador.categoria_id}
              onChange={(e) => setFormContador((f) => ({ ...f, categoria_id: e.target.value }))}
              required
            >
              <option value="">Seleccioná una categoría</option>
              {categoriasDisponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>

            <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="contador-frecuencia">
              Frecuencia de reinicio
            </label>
            <select
              id="contador-frecuencia"
              className="select-field mb-4"
              value={formContador.frecuencia}
              onChange={(e) => setFormContador((f) => ({ ...f, frecuencia: e.target.value }))}
            >
              {FRECUENCIAS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>

            {errorContador && (
              <p className="text-sm text-rose-600 mb-3">{errorContador}</p>
            )}
            {categoriasDisponibles.length === 0 && (
              <p className="text-sm text-amber-700 mb-3">
                Ya hay un contador para cada categoría. Quitá uno para agregar otro.
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setModalContador(false)}
                disabled={guardandoContador}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={guardandoContador || categoriasDisponibles.length === 0}
              >
                {guardandoContador ? 'Guardando…' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Movimientos de Hoy */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
          <TrendingUp className="mr-2" size={20} />
          Movimientos de Hoy
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-gray-600 text-sm">Total Movimientos</p>
            <p className="text-2xl font-bold text-gray-800">
              {stats?.movimientosHoy?.total_movimientos || 0}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Entradas</p>
            <p className="text-2xl font-bold text-green-600">
              {stats?.movimientosHoy?.total_entradas || 0}
            </p>
          </div>
          <div>
            <p className="text-gray-600 text-sm">Salidas</p>
            <p className="text-2xl font-bold text-red-600">
              {stats?.movimientosHoy?.total_salidas || 0}
            </p>
          </div>
        </div>
      </div>

      {productosVencer.length > 0 && (
        <div className="bg-amber-50 rounded-lg shadow p-6 mb-8 border-l-4 border-amber-500">
          <div className="flex flex-wrap justify-between items-center gap-2 mb-3">
            <h3 className="text-xl font-semibold text-amber-950 flex items-center">
              <AlertTriangle className="mr-2 text-amber-600" size={20} />
              Vencimientos ({productosVencer.length})
            </h3>
            <Link to="/productos" className="text-brand-600 hover:text-brand-800 text-sm flex items-center">
              Ver productos <ArrowRight size={16} className="ml-1" />
            </Link>
          </div>
          <p className="text-sm text-amber-900 mb-3">
            Productos con stock que vencen en 7 días o ya vencieron.
          </p>
          <div className="space-y-2">
            {productosVencer.slice(0, 6).map((p) => (
              <div
                key={p.id}
                className={`flex justify-between items-center p-3 rounded-lg border ${
                  p.vencido ? 'bg-red-50 border-red-200' : 'bg-white border-amber-200'
                }`}
              >
                <span className="font-medium text-gray-800">{p.nombre}</span>
                <span className={`text-sm font-semibold ${p.vencido ? 'text-red-700' : 'text-amber-800'}`}>
                  {p.vencido ? 'Vencido' : p.vence_hoy ? 'Hoy' : `En ${p.dias} día${p.dias === 1 ? '' : 's'}`}
                  {' · '}
                  {fmtFechaCorta(p.fecha_vencimiento)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grid de secciones */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Productos con Stock Bajo: alerta solo si hay UMBRAL_ALERTA_STOCK_BAJO o más */}
        {totalProductosStockBajo >= UMBRAL_ALERTA_STOCK_BAJO ? (
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800 flex items-center">
                <AlertTriangle className="mr-2 text-red-500" size={20} />
                Productos con Stock Bajo ({totalProductosStockBajo})
              </h3>
              <Link
                to="/productos"
                className="text-brand-600 hover:text-brand-800 text-sm flex items-center"
              >
                Ver todos <ArrowRight size={16} className="ml-1" />
              </Link>
            </div>
            <p className="text-sm text-gray-600 mb-3">
              Alerta activa: hay {totalProductosStockBajo} producto{totalProductosStockBajo !== 1 ? 's' : ''} en o por
              debajo del mínimo.
            </p>
            <div className="space-y-3">
              {productosStockBajo.map((producto) => (
                <div
                  key={producto.id}
                  className="flex justify-between items-center p-3 bg-red-50 rounded-lg border border-red-200"
                >
                  <div className="flex-1">
                    <p className="font-medium text-gray-800">{producto.nombre}</p>
                    <p className="text-sm text-gray-600">
                      {producto.categoria_nombre || 'Sin categoría'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-600 font-bold">
                      {fmtCantidadStock(producto.stock_actual, producto.unidad_medida)}
                    </p>
                    <p className="text-xs text-gray-500">
                      Mín: {producto.stock_minimo}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold text-gray-800 flex items-center mb-4">
              <AlertTriangle
                className={`mr-2 ${totalProductosStockBajo === 0 ? 'text-green-500' : 'text-amber-500'}`}
                size={20}
              />
              Productos con Stock Bajo
            </h3>
            {totalProductosStockBajo === 0 ? (
              <p className="text-gray-600 text-center py-4">
                ¡Excelente! No hay productos con stock bajo en este momento.
              </p>
            ) : (
              <div className="space-y-2">
                {productosStockBajo.map((producto) => (
                  <div
                    key={producto.id}
                    className="flex justify-between items-center py-2 px-3 rounded-lg bg-amber-50 border border-amber-100"
                  >
                    <span className="font-medium text-gray-800">{producto.nombre}</span>
                    <span className="text-gray-700 tabular-nums font-medium">
                      {fmtCantidadStock(producto.stock_actual, producto.unidad_medida)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Top Productos */}
        {stats?.topProductos && stats.topProductos.length > 0 ? (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Top 5 Productos con Más Stock</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Producto</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Stock</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Precio Venta</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.topProductos.map((producto, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">{producto.nombre}</td>
                      <td className="py-3 px-4 text-right">
                        {fmtCantidadStock(producto.stock_actual, producto.unidad_medida)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        ${Number(producto.precio_venta || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">Top 5 Productos con Más Stock</h3>
            <p className="text-gray-600 text-center py-4">
              No hay productos registrados aún.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard

