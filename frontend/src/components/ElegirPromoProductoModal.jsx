import { useEffect } from 'react'
import { Package, Tag, X } from 'lucide-react'
import { fmtMoney } from '../utils/promociones'
import { etiquetaPrecioUnidad } from '../utils/unidades'

/**
 * Al escanear / tildar un producto con promoción: elegir suelto o promo.
 */
const ElegirPromoProductoModal = ({ producto, promociones, onElegirSuelto, onElegirPromo, onClose }) => {
  const promos = Array.isArray(promociones) ? promociones : []

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === '1') {
        e.preventDefault()
        onElegirSuelto()
        return
      }
      const n = Number(e.key)
      if (n >= 2 && n <= promos.length + 1) {
        e.preventDefault()
        const promo = promos[n - 2]
        if (promo) onElegirPromo(promo)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [promos, onElegirSuelto, onElegirPromo, onClose])

  if (!producto) return null

  return (
    <div
      className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="modal-panel max-w-md"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="elegir-promo-titulo"
      >
        <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
          <h3 id="elegir-promo-titulo" className="text-lg font-semibold text-gray-900">
            ¿Cómo lo vendés?
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <p className="text-sm text-gray-700">
            <span className="font-semibold text-gray-900">{producto.nombre}</span> tiene promoción. Elegí una
            opción:
          </p>

          <button
            type="button"
            onClick={onElegirSuelto}
            className="w-full text-left rounded-xl border-2 border-gray-200 hover:border-emerald-400 hover:bg-emerald-50 p-4 transition-colors"
          >
            <div className="flex items-start gap-3">
              <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-sm">
                1
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900 inline-flex items-center gap-1.5">
                  <Package size={16} className="text-emerald-700" />
                  Producto suelto
                </p>
                <p className="text-xs text-gray-500 mt-0.5">{producto.nombre}</p>
                <p className="text-base font-bold text-emerald-700 tabular-nums mt-1">
                  {fmtMoney(producto.precio_venta)}
                  <span className="text-xs font-medium text-gray-500 ml-1">
                    {etiquetaPrecioUnidad(producto.unidad_medida)}
                  </span>
                </p>
              </div>
            </div>
          </button>

          {promos.map((pr, i) => (
            <button
              key={pr.id}
              type="button"
              onClick={() => onElegirPromo(pr)}
              className="w-full text-left rounded-xl border-2 border-violet-200 hover:border-violet-400 hover:bg-violet-50 p-4 transition-colors"
            >
              <div className="flex items-start gap-3">
                <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-violet-100 text-violet-800 flex items-center justify-center font-bold text-sm">
                  {i + 2}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900 inline-flex items-center gap-1.5">
                    <Tag size={16} className="text-violet-700" />
                    {pr.nombre}
                  </p>
                  <p className="text-base font-bold text-violet-800 tabular-nums mt-1">
                    {fmtMoney(pr.precio_promocional)}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ElegirPromoProductoModal
