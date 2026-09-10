import { useEffect, useState } from 'react'
import { productosAPI, categoriasAPI } from '../services/api'
import CategoriaProductoSelect from '../components/CategoriaProductoSelect'
import { Edit, Trash2, Package, Search, ChevronUp, ChevronDown } from 'lucide-react'
import ProductoModal from '../components/ProductoModal'
import { esUnidadLitro, esVentaPorMedidaDecimal, UMBRAL_KG_SIN_MINIMO, UMBRAL_STOCK_SIN_MINIMO, fmtCantidadStock } from '../utils/unidades'
import { productoNoControlaStock, productoNoVerificaVencimiento, esProductoSistema } from '../utils/stockProducto'
import { addDaysISO, fechaISOParaInput, fmtFechaCorta, hoyLocalISO } from '../utils/fechas'

/** Sin mínimo: unidades ≤2; kg/l ≤0.5 (alineado con backend) */
function esStockBajo(stockActual, stockMinimo, unidadMedida, producto) {
  if (productoNoControlaStock(producto)) return false
  const min = Number(stockMinimo) || 0
  const act = Number(stockActual) || 0
  if (min > 0) return act <= min
  if (esVentaPorMedidaDecimal(unidadMedida)) return act <= UMBRAL_KG_SIN_MINIMO
  return act <= UMBRAL_STOCK_SIN_MINIMO
}

const valorOrden = (p, key) => {
  switch (key) {
    case 'codigo':
      return String(p.codigo || '').toLowerCase()
    case 'nombre':
      return String(p.nombre || '').toLowerCase()
    case 'categoria':
      return String(p.categoria_nombre || '').toLowerCase()
    case 'stock':
      if (productoNoControlaStock(p)) return Number.NEGATIVE_INFINITY
      return Number(p.stock_actual) || 0
    case 'vencimiento':
      if (productoNoVerificaVencimiento(p)) return '9999-12-31'
      return fechaISOParaInput(p.fecha_vencimiento) || '9999-12-31'
    case 'precio_compra':
      return Number(p.precio_compra) || 0
    case 'precio_venta':
      return Number(p.precio_venta) || 0
    default:
      return ''
  }
}

const compararValores = (a, b) => {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' })
}

const COLUMNAS_ORDEN = [
  { key: 'codigo', label: 'Código', align: 'left', cellClass: 'hidden sm:table-cell' },
  { key: 'nombre', label: 'Nombre', align: 'left' },
  { key: 'categoria', label: 'Categoría', align: 'left', cellClass: 'hidden lg:table-cell' },
  { key: 'stock', label: 'Stock', align: 'right' },
  { key: 'vencimiento', label: 'Vencimiento', align: 'left', cellClass: 'hidden md:table-cell' },
  { key: 'precio_compra', label: 'Precio Compra', align: 'right', cellClass: 'hidden xl:table-cell' },
  { key: 'precio_venta', label: 'Precio Venta', align: 'right' }
]

const ITEMS_POR_PAGINA = 10

const Productos = () => {
  const [productos, setProductos] = useState([])
  const [productosFiltrados, setProductosFiltrados] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedProducto, setSelectedProducto] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterStock, setFilterStock] = useState('todos') // todos, bajo, normal
  const [sortKey, setSortKey] = useState('nombre')
  const [sortDir, setSortDir] = useState('asc')
  const [pagina, setPagina] = useState(1)

  useEffect(() => {
    loadProductos()
    loadCategorias()
  }, [])

  useEffect(() => {
    filtrarProductos()
  }, [searchTerm, filterCategoria, filterStock, productos, sortKey, sortDir])

  useEffect(() => {
    setPagina(1)
  }, [searchTerm, filterCategoria, filterStock, sortKey, sortDir])

  const loadProductos = async () => {
    try {
      const response = await productosAPI.getAll()
      setProductos(response.data)
      setProductosFiltrados(response.data)
    } catch (error) {
      console.error('Error al cargar productos:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadCategorias = async () => {
    try {
      const response = await categoriasAPI.getAll()
      setCategorias(response.data)
    } catch (error) {
      console.error('Error al cargar categorías:', error)
    }
  }

  const filtrarProductos = () => {
    let filtrados = productos.filter((p) => !esProductoSistema(p))

    // Filtro por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtrados = filtrados.filter(p => 
        p.nombre?.toLowerCase().includes(term) ||
        p.codigo?.toLowerCase().includes(term) ||
        p.descripcion?.toLowerCase().includes(term)
      )
    }

    // Filtro por categoría
    if (filterCategoria) {
      filtrados = filtrados.filter(p => p.categoria_id == filterCategoria)
    }

    // Filtro por stock (misma lógica que dashboard / API)
    if (filterStock === 'bajo') {
      filtrados = filtrados.filter((p) =>
        esStockBajo(p.stock_actual, p.stock_minimo, p.unidad_medida, p)
      )
    } else if (filterStock === 'normal') {
      filtrados = filtrados.filter(
        (p) => !productoNoControlaStock(p) && !esStockBajo(p.stock_actual, p.stock_minimo, p.unidad_medida, p)
      )
    }

    filtrados = [...filtrados].sort((pa, pb) => {
      const cmp = compararValores(valorOrden(pa, sortKey), valorOrden(pb, sortKey))
      return sortDir === 'asc' ? cmp : -cmp
    })

    setProductosFiltrados(filtrados)
  }

  const totalPaginas = Math.max(1, Math.ceil(productosFiltrados.length / ITEMS_POR_PAGINA))
  const paginaSafe = Math.min(pagina, totalPaginas)
  const startIndex = (paginaSafe - 1) * ITEMS_POR_PAGINA
  const productosPaginados = productosFiltrados.slice(startIndex, startIndex + ITEMS_POR_PAGINA)

  useEffect(() => {
    if (pagina > totalPaginas) {
      setPagina(totalPaginas)
    }
  }, [pagina, totalPaginas])

  const toggleOrden = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar este producto?')) {
      try {
        await productosAPI.delete(id)
        loadProductos()
      } catch (error) {
        console.error('Error al eliminar producto:', error)
        const errorMessage = error.response?.data?.error || 'Error al eliminar el producto'
        alert(errorMessage)
      }
    }
  }

  const handleEdit = (producto) => {
    setSelectedProducto(producto)
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
    setSelectedProducto(null)
    loadProductos()
  }

  const getStockColor = (stock, minimo, unidadMedida) => {
    if (esStockBajo(stock, minimo, unidadMedida)) return 'text-red-600 font-bold'
    const m = Number(minimo) || 0
    if (m > 0 && stock <= m * 1.5) return 'text-yellow-600'
    return 'text-green-600'
  }

  if (loading) {
    return <div className="text-center py-12">Cargando productos...</div>
  }

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="mb-8">
        <h2 className="page-title">Productos</h2>
      </div>

      {/* Filtros y búsqueda */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por nombre, código o descripción..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>
          <div>
            <select
              value={filterCategoria}
              onChange={(e) => setFilterCategoria(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="">Todas las categorías</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={filterStock}
              onChange={(e) => setFilterStock(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="todos">Todos los productos</option>
              <option value="bajo">Stock bajo</option>
              <option value="normal">Stock normal</option>
            </select>
          </div>
        </div>
        {productosFiltrados.length !== productos.length && (
          <div className="mt-3 text-sm text-gray-600">
            {productosFiltrados.length} de {productos.length} productos coinciden con los filtros
          </div>
        )}
      </div>

      {productos.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Package className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">No hay productos registrados</p>
        </div>
      ) : productosFiltrados.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Package className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">No se encontraron productos con los filtros aplicados</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow dark:bg-slate-900 min-w-0 max-w-full">
          <div className="overflow-x-auto overflow-y-visible w-full min-w-0 max-w-full [scrollbar-width:thin]">
            <table className="min-w-full">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  {COLUMNAS_ORDEN.map((col) => {
                    const activo = sortKey === col.key
                    const align =
                      col.align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
                    return (
                      <th
                        key={col.key}
                        className={`px-3 sm:px-6 py-3 text-xs font-medium uppercase ${
                          col.align === 'right' ? 'text-right' : 'text-left'
                        } ${col.cellClass || ''}`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleOrden(col.key)}
                          className={`inline-flex items-center gap-1 w-full ${align} select-none ${
                            activo
                              ? 'text-brand-700 dark:text-brand-300'
                              : 'text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100'
                          }`}
                          title={`Ordenar por ${col.label}`}
                        >
                          <span>{col.label}</span>
                          {activo ? (
                            sortDir === 'asc' ? (
                              <ChevronUp size={14} className="shrink-0" />
                            ) : (
                              <ChevronDown size={14} className="shrink-0" />
                            )
                          ) : (
                            <span className="inline-flex flex-col -space-y-1.5 opacity-40 shrink-0">
                              <ChevronUp size={10} />
                              <ChevronDown size={10} />
                            </span>
                          )}
                        </button>
                      </th>
                    )
                  })}
                  <th className="px-3 sm:px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {productosPaginados.map((producto) => (
                  <tr key={producto.id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-900 hidden sm:table-cell">
                      {producto.codigo || '-'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4">
                      <div className="text-sm font-medium text-gray-900">{producto.nombre}</div>
                      {producto.descripcion && (
                        <div className="text-sm text-gray-500 line-clamp-2">{producto.descripcion}</div>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-500 hidden lg:table-cell">
                      <CategoriaProductoSelect
                        productoId={producto.id}
                        categoriaId={producto.categoria_id}
                        categorias={categorias}
                        onSaved={(actualizado) =>
                          setProductos((prev) =>
                            prev.map((p) => (p.id === actualizado.id ? { ...p, ...actualizado } : p))
                          )
                        }
                      />
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right">
                      {productoNoControlaStock(producto) ? (
                        <span className="text-sm font-medium text-violet-700">Sin stock</span>
                      ) : (
                        <>
                          <span
                            className={`text-sm font-medium ${getStockColor(producto.stock_actual, producto.stock_minimo, producto.unidad_medida)}`}
                          >
                            {fmtCantidadStock(producto.stock_actual, producto.unidad_medida)}
                          </span>
                          {esStockBajo(producto.stock_actual, producto.stock_minimo, producto.unidad_medida, producto) && (
                            <div className="text-xs text-red-500">
                              {Number(producto.stock_minimo) > 0
                                ? `Mín: ${producto.stock_minimo}`
                                : esVentaPorMedidaDecimal(producto.unidad_medida)
                                  ? `Stock bajo (≤${UMBRAL_KG_SIN_MINIMO} ${esUnidadLitro(producto.unidad_medida) ? 'l' : 'kg'})`
                                  : `Stock bajo (≤${UMBRAL_STOCK_SIN_MINIMO})`}
                            </div>
                          )}
                        </>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm hidden md:table-cell">
                      {productoNoVerificaVencimiento(producto) ? (
                        <span className="text-gray-400">{productoNoControlaStock(producto) ? '—' : 'No verifica'}</span>
                      ) : producto.fecha_vencimiento ? (
                        (() => {
                          const f = fechaISOParaInput(producto.fecha_vencimiento)
                          const hoy = hoyLocalISO()
                          const vencido = f && f < hoy
                          const porVencer = f && f >= hoy && f <= addDaysISO(hoy, 7)
                          return (
                            <span
                              className={
                                vencido
                                  ? 'font-semibold text-red-600'
                                  : porVencer
                                    ? 'font-semibold text-amber-700'
                                    : 'text-gray-700'
                              }
                            >
                              {fmtFechaCorta(f)}
                            </span>
                          )
                        })()
                      ) : (
                        <span className="text-amber-700 text-xs">Sin fecha</span>
                      )}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right text-sm text-gray-900 hidden xl:table-cell">
                      ${Number(producto.precio_compra || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-right text-sm text-gray-900">
                      ${Number(producto.precio_venta || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-center text-sm font-medium">
                      <div className="flex justify-center space-x-2">
                        <button
                          onClick={() => handleEdit(producto)}
                          className="text-indigo-600 hover:text-indigo-900"
                          title="Editar"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(producto.id)}
                          className="text-red-600 hover:text-red-900"
                          title="Eliminar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 px-3 sm:px-6 py-4 border-t border-gray-200 dark:border-slate-700">
            <p className="text-sm text-gray-600 dark:text-slate-400">
              Mostrando {productosFiltrados.length === 0 ? 0 : startIndex + 1} a{' '}
              {Math.min(startIndex + ITEMS_POR_PAGINA, productosFiltrados.length)} de {productosFiltrados.length}{' '}
              productos
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPagina((prev) => Math.max(prev - 1, 1))}
                disabled={paginaSafe === 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Anterior
              </button>
              <span className="text-sm text-gray-700 dark:text-slate-300">
                Página {paginaSafe} de {totalPaginas}
              </span>
              <button
                type="button"
                onClick={() => setPagina((prev) => Math.min(prev + 1, totalPaginas))}
                disabled={paginaSafe === totalPaginas}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:border-slate-600 dark:hover:bg-slate-800"
              >
                Siguiente
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && selectedProducto && (
        <ProductoModal producto={selectedProducto} onClose={handleModalClose} />
      )}
    </div>
  )
}

export default Productos

