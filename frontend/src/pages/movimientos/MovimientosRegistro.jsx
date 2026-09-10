import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { movimientosAPI } from '../../services/api'
import { ArrowDownCircle, ArrowUpCircle, RotateCcw, Search, ArrowLeft, Truck } from 'lucide-react'
import {
  parsePagosDesglose,
  consolidarPromosEnMovimientos
} from '../../utils/movimientosPromo'
import { hoyLocalISO } from '../../utils/fechas'

const hoyISO = hoyLocalISO

function textoMetodoPago(m) {
  if (!m.metodo_pago) return '—'
  if (m.metodo_pago === 'mixto') {
    const p = parsePagosDesglose(m)
    if (p && typeof p === 'object') {
      const parts = Object.entries(p)
        .filter(([, v]) => Number(v) > 0)
        .map(
          ([k, v]) =>
            `${k.toUpperCase()} $${Number(v).toLocaleString('es-ES', {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}`
        )
      return parts.length ? `Mixto (${parts.join(' · ')})` : 'MIXTO'
    }
    return 'MIXTO'
  }
  return m.metodo_pago.toUpperCase()
}

/** Filtro por medio: incluye líneas mixtas que tengan ese medio en el desglose. */
function movimientoCoincideFiltroMetodo(m, filtro) {
  if (filtro === 'todos') return true
  if (filtro === 'sin-definir') return !m.metodo_pago
  if (filtro === 'mixto') return m.metodo_pago === 'mixto'
  const p = parsePagosDesglose(m)
  if (p && Number(p[filtro]) > 0) return true
  return m.metodo_pago === filtro
}

const MovimientosRegistro = () => {
  const [movimientos, setMovimientos] = useState([])
  const [movimientosFiltrados, setMovimientosFiltrados] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterTipo, setFilterTipo] = useState('todos')
  const [filterMetodoPago, setFilterMetodoPago] = useState('todos')
  const [fechaDesde, setFechaDesde] = useState(() => hoyISO())
  const [fechaHasta, setFechaHasta] = useState(() => hoyISO())
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10

  useEffect(() => {
    loadMovimientos()
  }, [])

  useEffect(() => {
    filtrarMovimientos()
  }, [searchTerm, filterTipo, filterMetodoPago, fechaDesde, fechaHasta, movimientos])

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, filterTipo, filterMetodoPago, fechaDesde, fechaHasta])

  const loadMovimientos = async () => {
    try {
      const response = await movimientosAPI.getAll({ limit: 100000 })
      setMovimientos(response.data)
      setMovimientosFiltrados(response.data)
    } catch (error) {
      console.error('Error al cargar movimientos:', error)
    } finally {
      setLoading(false)
    }
  }

  const filtrarMovimientos = () => {
    let filtrados = [...movimientos]

    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtrados = filtrados.filter(
        (m) =>
          m.producto_nombre?.toLowerCase().includes(term) ||
          m.producto_codigo?.toLowerCase().includes(term) ||
          m.promo_nombre?.toLowerCase().includes(term) ||
          m.motivo?.toLowerCase().includes(term) ||
          m.usuario?.toLowerCase().includes(term)
      )
    }

    if (filterTipo !== 'todos') {
      filtrados = filtrados.filter((m) => m.tipo === filterTipo)
    }

    if (filterMetodoPago !== 'todos') {
      filtrados = filtrados.filter((m) => movimientoCoincideFiltroMetodo(m, filterMetodoPago))
    }

    if (fechaDesde) {
      const desde = new Date(`${fechaDesde}T00:00:00`)
      filtrados = filtrados.filter((m) => new Date(m.fecha) >= desde)
    }
    if (fechaHasta) {
      const hasta = new Date(`${fechaHasta}T23:59:59.999`)
      filtrados = filtrados.filter((m) => new Date(m.fecha) <= hasta)
    }

    setMovimientosFiltrados(consolidarPromosEnMovimientos(filtrados))
  }

  const totalPages = Math.max(1, Math.ceil(movimientosFiltrados.length / itemsPerPage))
  const currentPageSafe = Math.min(currentPage, totalPages)
  const startIndex = (currentPageSafe - 1) * itemsPerPage
  const movimientosPaginados = movimientosFiltrados.slice(startIndex, startIndex + itemsPerPage)

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, totalPages])

  const getTipoIcon = (tipo) => {
    switch (tipo) {
      case 'entrada':
        return <ArrowDownCircle className="text-green-600" size={20} />
      case 'salida':
        return <ArrowUpCircle className="text-red-600" size={20} />
      case 'baja':
        return <ArrowUpCircle className="text-rose-700" size={20} />
      case 'ajuste':
        return <RotateCcw className="text-brand-600" size={20} />
      case 'pago_proveedor':
        return <Truck className="text-orange-600" size={20} />
      default:
        return null
    }
  }

  const getTipoColor = (tipo) => {
    switch (tipo) {
      case 'entrada':
        return 'bg-green-100 text-green-800'
      case 'salida':
        return 'bg-red-100 text-red-800'
      case 'baja':
        return 'bg-rose-100 text-rose-900'
      case 'ajuste':
        return 'bg-blue-100 text-blue-800'
      case 'pago_proveedor':
        return 'bg-orange-100 text-orange-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const etiquetaTipo = (tipo, movimiento) => {
    if (tipo === 'pago_proveedor') return 'PAGO PROVEEDOR'
    if (tipo === 'baja') return 'BAJA'
    const codigo = String(movimiento?.producto_codigo || '')
      .trim()
      .toUpperCase()
    if (tipo === 'ajuste' && codigo === 'REINICIO-CAFE') {
      return 'REINICIO CAFÉ'
    }
    if (tipo === 'ajuste' && codigo === 'REINICIO-MILANESAS') {
      return 'REINICIO MILANESAS'
    }
    if (tipo === 'ajuste' && codigo === 'REINICIO-SANDWICH-MIL') {
      return 'REINICIO SANDWICH MIL.'
    }
    if (tipo === 'ajuste' && codigo === 'REINICIO-ROLLITOS-JQ') {
      return 'REINICIO ROLLITOS JQ'
    }
    if (tipo === 'ajuste' && codigo === 'REINICIO-CIGARRILLOS') {
      return 'REINICIO CIGARRILLOS'
    }
    return tipo.toUpperCase()
  }

  const precioVentaMov = (m) => {
    if (m.tipo === 'salida' && m.precio_unitario != null && m.precio_unitario !== '') {
      return Number(m.precio_unitario)
    }
    const codigo = String(m?.producto_codigo || '')
      .trim()
      .toUpperCase()
    if (
      m.tipo === 'ajuste' &&
      (codigo === 'REINICIO-MILANESAS' ||
        codigo === 'REINICIO-SANDWICH-MIL' ||
        codigo === 'REINICIO-ROLLITOS-JQ' ||
        codigo === 'REINICIO-CIGARRILLOS') &&
      m.precio_unitario != null &&
      m.precio_unitario !== ''
    ) {
      return Number(m.precio_unitario)
    }
    return null
  }

  const importeSalida = (m) => {
    if (m.tipo === 'pago_proveedor') {
      const total = Number(m.monto_total)
      return Number.isFinite(total) ? -total : null
    }
    if (m._esPromoAgrupada && m._importePromo != null) {
      return Number(m._importePromo)
    }
    const codigo = String(m?.producto_codigo || '')
      .trim()
      .toUpperCase()
    if (
      m.tipo === 'ajuste' &&
      (codigo === 'REINICIO-MILANESAS' ||
        codigo === 'REINICIO-SANDWICH-MIL' ||
        codigo === 'REINICIO-ROLLITOS-JQ' ||
        codigo === 'REINICIO-CIGARRILLOS')
    ) {
      const pu = Number(m.precio_unitario)
      if (!Number.isFinite(pu)) return null
      return pu
    }
    const pu = precioVentaMov(m)
    if (pu == null || Number.isNaN(pu)) return null
    return m.cantidad * pu
  }

  const fmtImporte = (n) =>
    `$${Math.abs(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleString('es-ES', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (loading) {
    return <div className="text-center py-12">Cargando movimientos...</div>
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

      <div className="flex justify-between items-center mb-8">
        <h2 className="page-title">Movimientos</h2>
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1 opacity-0 select-none">Buscar</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Buscar por producto, proveedor, código, motivo o usuario..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1 opacity-0 select-none">Tipo</label>
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="todos">Todos los tipos</option>
              <option value="entrada">Entradas</option>
              <option value="salida">Salidas</option>
              <option value="baja">Bajas</option>
              <option value="ajuste">Ajustes</option>
              <option value="pago_proveedor">Pagos a proveedores</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Metodo de pago</label>
            <select
              value={filterMetodoPago}
              onChange={(e) => setFilterMetodoPago(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="todos">Todos</option>
              <option value="efectivo">EFECTIVO</option>
              <option value="transferencia">TRANSFERENCIA</option>
              <option value="tarjeta">TARJETA</option>
              <option value="fiado">FIADO</option>
              <option value="mixto">Mixto (varios medios)</option>
              <option value="sin-definir">Sin definir</option>
            </select>
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Desde</label>
            <input
              type="date"
              value={fechaDesde}
              max={hoyISO()}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              aria-label="Fecha desde"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs text-gray-600 mb-1">Hasta</label>
            <input
              type="date"
              value={fechaHasta}
              max={hoyISO()}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              aria-label="Fecha hasta"
            />
          </div>
        </div>
        {movimientosFiltrados.length !== movimientos.length && (
          <div className="mt-3 text-sm text-gray-600">
            Mostrando {movimientosFiltrados.length} de {movimientos.length} movimientos
          </div>
        )}
      </div>

      {movimientos.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-600">No hay movimientos registrados</p>
        </div>
      ) : movimientosFiltrados.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-600">No se encontraron movimientos con los filtros aplicados</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-scroll overflow-y-auto max-h-[65vh]">
            <table className="min-w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Producto</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Código</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Cantidad</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">P. venta</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Importe</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Motivo</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Metodo de pago</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {movimientosPaginados.map((movimiento) => (
                  <tr key={movimiento.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(movimiento.fecha)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {movimiento.tipo === 'pago_proveedor' ? (
                        <span title="Proveedor">{movimiento.producto_nombre}</span>
                      ) : movimiento._esPromoAgrupada ? (
                        <span>
                          <span className="inline-flex items-center px-1.5 py-0.5 mr-1.5 rounded text-[10px] font-bold uppercase tracking-wide bg-violet-100 text-violet-800">
                            Promo
                          </span>
                          {movimiento.producto_nombre}
                        </span>
                      ) : (
                        movimiento.producto_nombre
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {movimiento.tipo === 'pago_proveedor' ? '—' : movimiento.producto_codigo || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <div className="flex items-center justify-center space-x-2">
                        {getTipoIcon(movimiento.tipo)}
                        <span
                          className={`px-2 py-1 rounded-full text-xs font-medium ${getTipoColor(movimiento.tipo)}`}
                        >
                          {etiquetaTipo(movimiento.tipo, movimiento)}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium text-gray-900">
                      {movimiento.tipo === 'pago_proveedor' ? (
                        '—'
                      ) : (
                        <>
                          {movimiento.tipo === 'entrada' ? '+' : movimiento.tipo === 'salida' || movimiento.tipo === 'baja' ? '-' : ''}
                          {Number(movimiento.cantidad).toLocaleString('es-ES', {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 3
                          })}
                        </>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm text-gray-600">
                      {precioVentaMov(movimiento) != null
                        ? `$${precioVentaMov(movimiento).toLocaleString('es-ES', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}`
                        : '—'}
                    </td>
                    <td
                      className={`px-6 py-4 whitespace-nowrap text-right text-sm font-medium ${
                        importeSalida(movimiento) != null && importeSalida(movimiento) < 0
                          ? 'text-red-700'
                          : 'text-gray-800'
                      }`}
                    >
                      {importeSalida(movimiento) != null
                        ? `${importeSalida(movimiento) < 0 ? '-' : ''}${fmtImporte(importeSalida(movimiento))}`
                        : '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">{movimiento.motivo || '-'}</td>
                    <td
                      className="px-6 py-4 text-sm text-gray-600 max-w-[16rem]"
                      title={textoMetodoPago(movimiento)}
                    >
                      <span className="line-clamp-2">{textoMetodoPago(movimiento)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {movimiento.usuario || 'Sistema'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-6 py-4 border-t border-gray-200">
            <p className="text-sm text-gray-600">
              Mostrando {movimientosFiltrados.length === 0 ? 0 : startIndex + 1} a{' '}
              {Math.min(startIndex + itemsPerPage, movimientosFiltrados.length)} de {movimientosFiltrados.length}{' '}
              movimientos
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                disabled={currentPageSafe === 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-700">
                Página {currentPageSafe} de {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                disabled={currentPageSafe === totalPages}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MovimientosRegistro
