import { useEffect, useState } from 'react'
import { categoriasAPI, productosAPI } from '../services/api'
import { fmtCantidadStock } from '../utils/unidades'
import { Plus, Edit, Trash2, FolderTree, Package, X } from 'lucide-react'
import CategoriaModal from '../components/CategoriaModal'

const Categorias = () => {
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [selectedCategoria, setSelectedCategoria] = useState(null)
  /** Modal listado: { categoria, productos, loading, error? } | null */
  const [vistaProductos, setVistaProductos] = useState(null)

  useEffect(() => {
    loadCategorias()
  }, [])

  const loadCategorias = async () => {
    try {
      const response = await categoriasAPI.getAll()
      setCategorias(response.data)
    } catch (error) {
      console.error('Error al cargar categorías:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm('¿Estás seguro de eliminar esta categoría? Los productos asociados no se eliminarán, pero quedarán sin categoría.')) {
      try {
        await categoriasAPI.delete(id)
        loadCategorias()
      } catch (error) {
        console.error('Error al eliminar categoría:', error)
        const errorMessage = error.response?.data?.error || 'Error al eliminar la categoría'
        alert(errorMessage)
      }
    }
  }

  const handleEdit = (categoria) => {
    setSelectedCategoria(categoria)
    setShowModal(true)
  }

  const handleNew = () => {
    setSelectedCategoria(null)
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
    setSelectedCategoria(null)
    loadCategorias()
  }

  const handleVerProductos = async (categoria) => {
    setVistaProductos({ categoria, productos: [], loading: true })
    try {
      const { data } = await productosAPI.getAll()
      const arr = Array.isArray(data) ? data : []
      const idCat = Number(categoria.id)
      const productos = arr.filter(
        (p) => p.categoria_id != null && Number(p.categoria_id) === idCat
      )
      setVistaProductos({ categoria, productos, loading: false })
    } catch (error) {
      console.error('Error al cargar productos:', error)
      setVistaProductos({ categoria, productos: [], loading: false, error: true })
    }
  }

  const cerrarVistaProductos = () => setVistaProductos(null)

  if (loading) {
    return <div className="text-center py-12">Cargando categorías...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h2 className="page-title">Categorías</h2>
        <button
          onClick={handleNew}
          className="btn-primary"
        >
          <Plus size={20} />
          <span>Nueva Categoría</span>
        </button>
      </div>

      {categorias.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <FolderTree className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">No hay categorías registradas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {categorias.map((categoria) => (
            <div key={categoria.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-gray-800 mb-2">
                    {categoria.nombre}
                  </h3>
                  {categoria.descripcion && (
                    <p className="text-gray-600 text-sm mb-3">{categoria.descripcion}</p>
                  )}
                  <p className="text-sm text-gray-500">
                    {categoria.total_productos || 0} producto(s)
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end items-center gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => handleVerProductos(categoria)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 border border-blue-100"
                  title="Ver productos de esta categoría"
                >
                  <Package size={16} />
                  Ver productos
                </button>
                <button
                  type="button"
                  onClick={() => handleEdit(categoria)}
                  className="text-indigo-600 hover:text-indigo-900 p-2"
                  title="Editar"
                >
                  <Edit size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(categoria.id)}
                  className="text-red-600 hover:text-red-900 p-2"
                  title="Eliminar"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <CategoriaModal
          categoria={selectedCategoria}
          onClose={handleModalClose}
        />
      )}

      {vistaProductos && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col"
            role="dialog"
            aria-labelledby="productos-categoria-titulo"
            aria-modal="true"
          >
            <div className="flex items-center justify-between gap-4 p-5 border-b">
              <h3 id="productos-categoria-titulo" className="text-lg font-semibold text-gray-900">
                Productos — {vistaProductos.categoria.nombre}
              </h3>
              <button
                type="button"
                onClick={cerrarVistaProductos}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Cerrar"
              >
                <X size={22} />
              </button>
            </div>
            <div className="p-5 overflow-y-auto flex-1">
              {vistaProductos.loading ? (
                <p className="text-center text-gray-600 py-8">Cargando productos…</p>
              ) : vistaProductos.error ? (
                <p className="text-center text-red-600 py-8">No se pudieron cargar los productos.</p>
              ) : vistaProductos.productos.length === 0 ? (
                <div className="text-center py-10">
                  <Package className="mx-auto text-gray-300 mb-3" size={40} />
                  <p className="text-gray-600">No hay productos asignados a esta categoría.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <tr>
                        <th className="px-4 py-3">Código</th>
                        <th className="px-4 py-3">Nombre</th>
                        <th className="px-4 py-3 text-right">Stock</th>
                        <th className="px-4 py-3 text-right">Precio venta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {vistaProductos.productos.map((p) => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 whitespace-nowrap text-gray-900">{p.codigo || '—'}</td>
                          <td className="px-4 py-3 text-gray-900">
                            <span className="font-medium">{p.nombre}</span>
                            {p.descripcion && (
                              <span className="block text-gray-500 font-normal text-xs mt-0.5 line-clamp-2">
                                {p.descripcion}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">
                            {fmtCantidadStock(p.stock_actual, p.unidad_medida)}
                          </td>
                          <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">
                            ${Number(p.precio_venta || 0).toLocaleString('es-ES', {
                              minimumFractionDigits: 2
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-end">
              <button
                type="button"
                onClick={cerrarVistaProductos}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Categorias

