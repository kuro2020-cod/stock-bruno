import { useState, useEffect, useMemo, useRef } from 'react'
import { promocionesAPI, productosAPI } from '../services/api'
import { fmtCantidadStock, esVentaPorMedidaDecimal } from '../utils/unidades'
import { esProductoSistema } from '../utils/stockProducto'
import { X, Plus, Trash2, Search } from 'lucide-react'

const emptyItem = () => ({
  producto_id: '',
  cantidad: 1,
  precio_unitario: ''
})

const emptyForm = () => ({
  nombre: '',
  tipo: 'combo',
  descripcion: '',
  precio_promocional: 0,
  cantidad_minima: 1,
  unidad_promo: 'unidad',
  activa: true,
  fecha_inicio: '',
  fecha_fin: ''
})

/** Selector de producto con filtro por nombre / código. */
function ProductoSelectBusqueda({ productos, value, onChange, required }) {
  const [q, setQ] = useState('')
  const [abierto, setAbierto] = useState(false)
  const wrapRef = useRef(null)

  const seleccionado = useMemo(
    () => productos.find((p) => String(p.id) === String(value)) || null,
    [productos, value]
  )

  const filtrados = useMemo(() => {
    const t = q.trim().toLowerCase()
    const base = productos
    if (!t) return base.slice(0, 40)
    return base
      .filter(
        (p) =>
          p.nombre?.toLowerCase().includes(t) ||
          String(p.codigo || '')
            .toLowerCase()
            .includes(t)
      )
      .slice(0, 40)
  }, [productos, q])

  useEffect(() => {
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setAbierto(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  if (seleccionado && !abierto) {
    return (
      <div>
        <label className="text-[10px] text-gray-500 uppercase">Producto</label>
        <button
          type="button"
          onClick={() => {
            setQ('')
            setAbierto(true)
          }}
          className="w-full text-left px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white hover:bg-gray-50"
        >
          <span className="font-medium text-gray-900 line-clamp-1">{seleccionado.nombre}</span>
          {seleccionado.codigo ? (
            <span className="block text-[10px] font-mono text-gray-500">{seleccionado.codigo}</span>
          ) : null}
        </button>
      </div>
    )
  }

  return (
    <div ref={wrapRef} className="relative">
      <label className="text-[10px] text-gray-500 uppercase">Producto</label>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={q}
          required={required && !value}
          placeholder="Buscar por nombre o código…"
          onChange={(e) => {
            setQ(e.target.value)
            setAbierto(true)
          }}
          onFocus={() => setAbierto(true)}
          className="w-full pl-7 pr-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500"
        />
      </div>
      {abierto && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg divide-y divide-gray-100">
          {filtrados.length === 0 ? (
            <li className="px-3 py-2 text-xs text-gray-500">Sin coincidencias</li>
          ) : (
            filtrados.map((prod) => (
              <li key={prod.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onChange(String(prod.id))
                    setQ('')
                    setAbierto(false)
                  }}
                  className={`w-full text-left px-3 py-2 hover:bg-brand-50 ${
                    String(prod.id) === String(value) ? 'bg-brand-50' : ''
                  }`}
                >
                  <p className="text-sm font-medium text-gray-900 truncate">{prod.nombre}</p>
                  <p className="text-[10px] font-mono text-gray-500">
                    {prod.codigo || 'Sin código'} · Stock{' '}
                    {fmtCantidadStock(prod.stock_actual, prod.unidad_medida)}
                  </p>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

const PromocionModal = ({ promocion, onClose }) => {
  const [formData, setFormData] = useState(emptyForm)
  const [items, setItems] = useState([emptyItem()])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    productosAPI
      .getAll()
      .then(({ data }) =>
        setProductos(Array.isArray(data) ? data.filter((p) => !esProductoSistema(p)) : [])
      )
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (promocion) {
      setFormData({
        nombre: promocion.nombre || '',
        tipo: promocion.tipo || 'combo',
        descripcion: promocion.descripcion || '',
        precio_promocional: Number(promocion.precio_promocional) || 0,
        cantidad_minima: Number(promocion.cantidad_minima) || 1,
        unidad_promo: promocion.unidad_promo || 'unidad',
        activa: promocion.activa !== false,
        fecha_inicio: promocion.fecha_inicio ? String(promocion.fecha_inicio).slice(0, 10) : '',
        fecha_fin: promocion.fecha_fin ? String(promocion.fecha_fin).slice(0, 10) : ''
      })
      const rawItems = promocion.items?.length
        ? promocion.items
        : promocion.producto_id
          ? [
              {
                producto_id: promocion.producto_id,
                cantidad: promocion.cantidad_minima || 1,
                precio_unitario: promocion.precio_promocional
              }
            ]
          : [emptyItem()]
      setItems(
        rawItems.map((it) => ({
          producto_id: String(it.producto_id),
          cantidad: Number(it.cantidad) || 1,
          precio_unitario:
            it.precio_unitario != null && it.precio_unitario !== '' ? String(it.precio_unitario) : ''
        }))
      )
    } else {
      setFormData(emptyForm())
      setItems([emptyItem()])
    }
  }, [promocion])

  const productoMap = useMemo(() => {
    const m = new Map()
    for (const p of productos) m.set(Number(p.id), p)
    return m
  }, [productos])

  const sumaLista = useMemo(() => {
    return items.reduce((s, it) => {
      const p = productoMap.get(Number(it.producto_id))
      if (!p) return s
      return s + Number(it.cantidad || 0) * Number(p.precio_venta || 0)
    }, 0)
  }, [items, productoMap])

  const updateItem = (idx, field, value) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it)))
  }

  const addItem = () => setItems((prev) => [...prev, emptyItem()])

  const removeItem = (idx) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payloadItems = items
      .filter((it) => it.producto_id)
      .map((it) => ({
        producto_id: Number(it.producto_id),
        cantidad: Number(it.cantidad),
        precio_unitario: it.precio_unitario === '' ? null : Number(it.precio_unitario)
      }))

    if (payloadItems.length === 0) {
      alert('Agregá al menos un producto a la promoción')
      return
    }

    setLoading(true)
    try {
      const payload = {
        ...formData,
        tipo: promocion?.tipo || 'combo',
        precio_promocional: Number(formData.precio_promocional),
        cantidad_minima: Number(formData.cantidad_minima) || 1,
        items: payloadItems
      }
      if (promocion) {
        await promocionesAPI.update(promocion.id, payload)
      } else {
        await promocionesAPI.create(payload)
      }
      onClose()
    } catch (error) {
      alert(error.response?.data?.error || 'Error al guardar la promoción')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="modal-panel max-w-2xl">
        <div className="flex justify-between items-center p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-800">
            {promocion ? 'Editar promoción' : 'Nueva promoción'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              placeholder="Ej. Promo hamburguesa completa"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows={2}
              placeholder="Qué incluye la promo…"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label className="text-sm font-semibold text-gray-800">Productos incluidos *</label>
              <button
                type="button"
                onClick={addItem}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900"
              >
                <Plus size={14} />
                Agregar producto
              </button>
            </div>
            <p className="text-xs text-gray-600">
              Armá la promo manualmente. Escribí el nombre o código para filtrar. Al venderla en Ventas se
              descuenta el stock de cada producto según las cantidades indicadas.
            </p>
            <div className="space-y-2">
              {items.map((it, idx) => {
                const p = productoMap.get(Number(it.producto_id))
                const esDecimal = p ? esVentaPorMedidaDecimal(p.unidad_medida) : false
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_5rem_6rem_auto] gap-2 items-end bg-white rounded-lg border border-gray-200 p-2"
                  >
                    <div>
                      <ProductoSelectBusqueda
                        productos={productos}
                        value={it.producto_id}
                        onChange={(id) => updateItem(idx, 'producto_id', id)}
                        required={idx === 0}
                      />
                      {p && (
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          Stock: {fmtCantidadStock(p.stock_actual, p.unidad_medida)} · Lista: $
                          {Number(p.precio_venta || 0).toFixed(2)}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase">Cant.</label>
                      <input
                        type="number"
                        min={esDecimal ? 0.001 : 1}
                        step={esDecimal ? 0.001 : 1}
                        value={it.cantidad}
                        onChange={(e) => updateItem(idx, 'cantidad', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-500 uppercase">P. unit. promo</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="Auto"
                        value={it.precio_unitario}
                        onChange={(e) => updateItem(idx, 'precio_unitario', e.target.value)}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={items.length <= 1}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 self-center"
                      title="Quitar"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Precio total de la promo *</label>
            <input
              type="number"
              name="precio_promocional"
              min="0"
              step="0.01"
              value={formData.precio_promocional}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
            />
            {sumaLista > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                Suma a precio lista: ${sumaLista.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Válida desde</label>
              <input
                type="date"
                name="fecha_inicio"
                value={formData.fecha_inicio}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Válida hasta</label>
              <input
                type="date"
                name="fecha_fin"
                value={formData.fecha_fin}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              name="activa"
              checked={formData.activa}
              onChange={handleChange}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            Promoción activa
          </label>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PromocionModal
