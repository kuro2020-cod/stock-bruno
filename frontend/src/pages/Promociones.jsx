import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { promocionesAPI, productosAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { esRolAdmin } from '../utils/roles'
import {
  TIPOS_PROMOCION,
  claseColorTipo,
  fmtMoney,
  promoVigente,
  textoIncluyeItemsPromo,
  textoFechasPromo
} from '../utils/promociones'
import { validarStockPromo, promoTieneItems } from '../utils/promocionVenta'
import { Plus, Edit, Trash2, Tag, Filter, ShoppingCart, Search } from 'lucide-react'
import PromocionModal from '../components/PromocionModal'
import { esAccesoLimitado } from '../utils/acceso'

const Promociones = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const esAdmin = esRolAdmin(user?.rol)
  const sinVentas = esAccesoLimitado(user)
  const [promociones, setPromociones] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filterTipo, setFilterTipo] = useState('todos')
  const [busqueda, setBusqueda] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [selected, setSelected] = useState(null)

  const load = async () => {
    try {
      const [promRes, prodRes] = await Promise.all([promocionesAPI.getAll(), productosAPI.getAll()])
      setPromociones(Array.isArray(promRes.data) ? promRes.data : [])
      setProductos(Array.isArray(prodRes.data) ? prodRes.data : [])
    } catch (e) {
      console.error(e)
      alert(e.response?.data?.error || 'No se pudieron cargar las promociones')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return promociones.filter((p) => {
      if (filterTipo !== 'todos' && p.tipo !== filterTipo) return false
      if (!q) return true
      return String(p.nombre || '')
        .toLowerCase()
        .includes(q)
    })
  }, [promociones, filterTipo, busqueda])

  const handleDelete = async (id) => {
    if (!window.confirm('¿Eliminar esta promoción?')) return
    try {
      await promocionesAPI.delete(id)
      load()
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudo eliminar')
    }
  }

  const handleCloseModal = () => {
    setShowModal(false)
    setSelected(null)
    load()
  }

  const cargarEnVentas = (p) => {
    if (!promoVigente(p)) {
      alert('Esta promoción no está vigente')
      return
    }
    if (!promoTieneItems(p)) {
      alert('La promoción no tiene productos configurados')
      return
    }
    const errores = validarStockPromo(p, productos, [])
    if (errores.length) {
      alert(`Stock insuficiente:\n${errores.join('\n')}`)
      return
    }
    navigate('/ventas', { state: { aplicarPromoId: p.id } })
  }

  const renderCard = (p) => {
    const vigente = promoVigente(p)
    const erroresStock = promoTieneItems(p) ? validarStockPromo(p, productos, []) : ['Sin productos']
    const sinStock = erroresStock.length > 0

    return (
      <div
        key={p.id}
        className={`rounded-xl border-2 p-5 shadow-sm ${claseColorTipo(p.tipo)} ${!p.activa ? 'opacity-60' : ''}`}
      >
        <div className="flex justify-between items-start gap-3 mb-2">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold">{p.nombre}</h3>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {!p.activa && (
              <span className="text-[10px] font-semibold uppercase bg-gray-200 text-gray-700 px-2 py-0.5 rounded">
                Inactiva
              </span>
            )}
            {p.activa && !vigente && (
              <span className="text-[10px] font-semibold uppercase bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                Fuera de fecha
              </span>
            )}
            {vigente && (
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
                  sinStock ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {sinStock ? 'Sin stock' : 'Vigente'}
              </span>
            )}
          </div>
        </div>

        {p.descripcion && <p className="text-sm opacity-90 mb-2">{p.descripcion}</p>}

        {promoTieneItems(p) && textoIncluyeItemsPromo(p) && (
          <p className="text-sm opacity-90 mb-2">{textoIncluyeItemsPromo(p)}</p>
        )}

        <p className="text-xl font-bold tabular-nums mb-2">{fmtMoney(p.precio_promocional)}</p>

        {textoFechasPromo(p) && <p className="text-xs opacity-75 mb-3">{textoFechasPromo(p)}</p>}

        <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-current/10">
          {vigente && promoTieneItems(p) && !sinVentas && (
            <button
              type="button"
              disabled={sinStock}
              onClick={() => cargarEnVentas(p)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={sinStock ? erroresStock.join('; ') : 'Cargar productos en Ventas'}
            >
              <ShoppingCart size={16} />
              Cargar en Ventas
            </button>
          )}
          {esAdmin && (
            <>
              <button
                type="button"
                onClick={() => {
                  setSelected(p)
                  setShowModal(true)
                }}
                className="p-2 text-indigo-700 hover:bg-white/50 rounded-lg ml-auto"
                title="Editar"
              >
                <Edit size={18} />
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.id)}
                className="p-2 text-red-700 hover:bg-white/50 rounded-lg"
                title="Eliminar"
              >
                <Trash2 size={18} />
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return <div className="text-center py-12 text-gray-600">Cargando promociones…</div>
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-8">
        <div>
          <h2 className="page-title">
            <Tag className="text-brand-600" size={32} />
            Promociones
          </h2>
          <p className="text-gray-600 mt-2">
            Armá combos manuales (hamburguesas, fiambre, pre-pizzas, maples de huevos). Al vender, elegí la promo y se
            cargan todos los productos en Ventas descontando stock.
            {esAdmin ? ' Creá y editá desde acá.' : ''}
          </p>
        </div>
        {esAdmin && (
          <button
            type="button"
            onClick={() => {
              setSelected(null)
              setShowModal(true)
            }}
            className="btn-primary shrink-0"
          >
            <Plus size={20} />
            Nueva promoción
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4 mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[12rem] max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
          />
        </div>
        <Filter size={18} className="text-gray-500" />
        <span className="text-sm text-gray-600">Tipo:</span>
        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white"
        >
          <option value="todos">Todas</option>
          {Object.values(TIPOS_PROMOCION).map((t) => (
            <option key={t.key} value={t.key}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {filtradas.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Tag className="mx-auto text-gray-300 mb-4" size={48} />
          <p className="text-gray-600">
            {busqueda.trim() || filterTipo !== 'todos'
              ? 'No hay promociones que coincidan con el filtro.'
              : 'No hay promociones registradas.'}
          </p>
          {esAdmin && (
            <button
              type="button"
              onClick={() => {
                setSelected(null)
                setShowModal(true)
              }}
              className="mt-4 text-brand-600 hover:underline text-sm font-medium"
            >
              Crear la primera promoción
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtradas.map(renderCard)}
        </div>
      )}

      {showModal && esAdmin && <PromocionModal promocion={selected} onClose={handleCloseModal} />}
    </div>
  )
}

export default Promociones
