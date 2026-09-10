import { useState, useEffect } from 'react'
import { movimientosAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { esVentaPorMedidaDecimal, etiquetaCantidadUnidad, fmtCantidadStock } from '../utils/unidades'
import { X } from 'lucide-react'

const MovimientoModal = ({ producto, onClose }) => {
  const { user } = useAuth()
  const [formData, setFormData] = useState({
    tipo: 'entrada',
    cantidad: 1,
    motivo: '',
    usuario: '',
    precio_unitario: 0
  })
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (producto) {
      const label = user
        ? [user.apellido, user.nombre].filter(Boolean).join(', ').trim() || user.usuario
        : 'Usuario'
      setFormData({
        tipo: 'entrada',
        cantidad: 1,
        motivo: '',
        usuario: label,
        precio_unitario: Number(producto.precio_venta) || 0
      })
    }
  }, [producto?.id, user])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        producto_id: producto.id,
        tipo: formData.tipo,
        cantidad: Number(formData.cantidad),
        motivo: formData.motivo,
        usuario: formData.usuario
      }
      if (formData.tipo === 'salida') {
        payload.precio_unitario = Number(formData.precio_unitario) || 0
      }
      await movimientosAPI.create(payload)
      onClose()
    } catch (error) {
      console.error('Error al crear movimiento:', error)
      alert(error.response?.data?.error || 'Error al crear el movimiento')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => {
      const next = {
        ...prev,
        [name]:
          name === 'cantidad'
            ? value === ''
              ? ''
              : parseFloat(value)
            : name === 'precio_unitario'
              ? value === ''
                ? ''
                : parseFloat(value)
              : value
      }
      if (name === 'tipo' && value === 'salida' && producto) {
        next.precio_unitario = Number(producto.precio_venta) || 0
      }
      return next
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="modal-panel max-w-md">
        <div className="flex justify-between items-start gap-3 p-4 sm:p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-800">
            Movimiento de Stock - {producto?.nombre}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Movimiento *</label>
            <select
              name="tipo"
              value={formData.tipo}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="entrada">Entrada</option>
              <option value="salida">Salida</option>
              <option value="ajuste">Ajuste</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Cantidad * {producto && etiquetaCantidadUnidad(producto.unidad_medida)}
            </label>
            <input
              type="number"
              name="cantidad"
              value={formData.cantidad}
              onChange={handleChange}
              required
              min={formData.tipo === 'ajuste' ? '0' : esVentaPorMedidaDecimal(producto?.unidad_medida) ? '0.001' : '1'}
              step={esVentaPorMedidaDecimal(producto?.unidad_medida) ? '0.001' : '1'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Stock actual:{' '}
              {producto
                ? fmtCantidadStock(producto.stock_actual, producto.unidad_medida)
                : '—'}
            </p>
            {formData.tipo === 'ajuste' && (
              <p className="text-xs text-brand-600 mt-1">
                Para ajuste, ingrese el stock final deseado
              </p>
            )}
            {formData.tipo === 'salida' && producto && (
              <p className="text-xs text-red-600 mt-1">
                Máximo disponible: {fmtCantidadStock(producto.stock_actual, producto.unidad_medida)}
              </p>
            )}
          </div>

          {formData.tipo === 'salida' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio unitario de venta *
              </label>
              <input
                type="number"
                name="precio_unitario"
                value={formData.precio_unitario === '' ? '' : formData.precio_unitario}
                onChange={handleChange}
                required
                min="0"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Se guarda en este movimiento para calcular ingresos con el precio vigente en la venta.
              </p>
              {formData.precio_unitario !== '' &&
                formData.cantidad > 0 &&
                !Number.isNaN(Number(formData.precio_unitario)) && (
                  <p className="text-xs text-emerald-700 mt-1 font-medium">
                    Importe línea:{' '}
                    $
                    {(Number(formData.cantidad) * Number(formData.precio_unitario)).toLocaleString('es-ES', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </p>
                )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
            <textarea
              name="motivo"
              value={formData.motivo}
              onChange={handleChange}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              placeholder="Descripción del movimiento..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input
              type="text"
              name="usuario"
              value={formData.usuario}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t">
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
              {loading ? 'Procesando...' : 'Registrar Movimiento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default MovimientoModal

