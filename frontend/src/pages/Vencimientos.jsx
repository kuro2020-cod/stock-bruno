import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, Package } from 'lucide-react'
import { productosAPI } from '../services/api'
import { fmtFechaCorta } from '../utils/fechas'
import { fmtCantidadStock } from '../utils/unidades'
import ProductoModal from '../components/ProductoModal'

function textoDias(p) {
  if (p.vencido) return 'VENCIDO'
  if (p.vence_hoy) return 'Vence hoy'
  if (p.dias === 1) return 'Vence mañana'
  return `Vence en ${p.dias} días`
}

function tituloAlerta(vencidos, porVencer) {
  if (vencidos.length > 0 && porVencer.length > 0) {
    return `${vencidos.length} vencido${vencidos.length === 1 ? '' : 's'} y ${porVencer.length} por vencer`
  }
  if (vencidos.length > 0) {
    return `${vencidos.length} producto${vencidos.length === 1 ? '' : 's'} vencido${vencidos.length === 1 ? '' : 's'}`
  }
  if (porVencer.length > 0) {
    return `${porVencer.length} producto${porVencer.length === 1 ? '' : 's'} vence${porVencer.length === 1 ? '' : 'n'} en 7 días`
  }
  return 'Sin vencimientos próximos'
}

const Vencimientos = () => {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [productoEditar, setProductoEditar] = useState(null)

  const cargar = async () => {
    try {
      const { data } = await productosAPI.getVencimientosAlerta()
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await productosAPI.getVencimientosAlerta()
        if (!cancelled) setItems(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setItems([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const vencidos = items.filter((p) => p.vencido)
  const porVencer = items.filter((p) => !p.vencido)
  const urgente = vencidos.length > 0

  if (loading) {
    return <div className="text-center py-12">Cargando vencimientos...</div>
  }

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="mb-8">
        <h2 className="page-title">
          <CalendarClock size={28} />
          Vencimientos
        </h2>
        <p className="page-subtitle">
          {tituloAlerta(vencidos, porVencer)}. Tocá un producto para editar el vencimiento. El aviso aparece una semana
          antes de la fecha.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600 dark:text-slate-400">
            No hay productos vencidos ni por vencer en los próximos 7 días.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div
            className={`px-5 py-3 border-b flex items-center gap-2 ${
              urgente
                ? 'bg-red-50 border-red-100 dark:bg-red-950/40 dark:border-red-900/50'
                : 'bg-amber-50 border-amber-100 dark:bg-amber-950/40 dark:border-amber-900/50'
            }`}
          >
            <AlertTriangle
              className={urgente ? 'text-red-600 dark:text-red-300' : 'text-amber-500 dark:text-amber-300'}
              size={20}
            />
            <p
              className={`text-sm font-semibold ${
                urgente ? 'text-red-800 dark:text-red-200' : 'text-amber-900 dark:text-amber-100'
              }`}
            >
              {tituloAlerta(vencidos, porVencer)}
            </p>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setProductoEditar(p)}
                  className="w-full text-left px-5 py-3 flex flex-wrap items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-slate-50 break-words">
                      {p.nombre}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-slate-400">
                      {p.codigo || 'Sin código'} · Stock {fmtCantidadStock(p.stock_actual, p.unidad_medida)}
                      {p.categoria_nombre ? ` · ${p.categoria_nombre}` : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p
                      className={`text-xs font-bold uppercase tracking-wide ${
                        p.vencido ? 'text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-200'
                      }`}
                    >
                      {textoDias(p)}
                    </p>
                    <p className="text-xs tabular-nums text-gray-700 dark:text-slate-300 flex items-center justify-end gap-1">
                      <CalendarClock size={12} />
                      {fmtFechaCorta(p.fecha_vencimiento)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {productoEditar && (
        <ProductoModal
          producto={productoEditar}
          onClose={() => {
            setProductoEditar(null)
            cargar()
          }}
        />
      )}
    </div>
  )
}

export default Vencimientos
