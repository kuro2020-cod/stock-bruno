import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarClock, X } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { productosAPI } from '../services/api'
import { fmtFechaCorta } from '../utils/fechas'
import { fmtCantidadStock } from '../utils/unidades'

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
  return `${porVencer.length} producto${porVencer.length === 1 ? '' : 's'} vence${porVencer.length === 1 ? '' : 'n'} en 7 días`
}

const AlertaVencimientos = () => {
  const location = useLocation()
  const [items, setItems] = useState([])
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await productosAPI.getVencimientosAlerta()
        if (!cancelled) setItems(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setItems([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [location.pathname])

  if (items.length === 0) return null

  const vencidos = items.filter((p) => p.vencido)
  const porVencer = items.filter((p) => !p.vencido)
  const urgente = vencidos.length > 0

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className={`fixed bottom-6 right-6 z-40 inline-flex items-center justify-center w-12 h-12 rounded-full shadow-lg border-2 print:hidden ${
          urgente
            ? 'bg-red-600 border-red-300 text-white hover:bg-red-700'
            : 'bg-amber-500 border-amber-200 text-white hover:bg-amber-600'
        }`}
        title={tituloAlerta(vencidos, porVencer)}
        aria-label={tituloAlerta(vencidos, porVencer)}
      >
        <AlertTriangle size={22} />
        <span className="absolute -top-1 -right-1 min-w-[1.25rem] h-5 px-1 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center border border-white/40">
          {items.length}
        </span>
      </button>

      {abierto && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setAbierto(false)}
          role="presentation"
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-lg max-h-[85dvh] overflow-hidden flex flex-col rounded-2xl shadow-2xl border border-gray-200 dark:border-slate-700"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="alerta-venc-titulo"
          >
            <div className="shrink-0 px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle
                  className={`shrink-0 mt-0.5 ${urgente ? 'text-red-600' : 'text-amber-500'}`}
                  size={22}
                />
                <div className="min-w-0">
                  <h3 id="alerta-venc-titulo" className="text-lg font-semibold text-gray-900 dark:text-slate-50">
                    {tituloAlerta(vencidos, porVencer)}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-slate-400 mt-0.5">
                    Revisá el stock con vencimiento. El aviso aparece una semana antes de la fecha.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-slate-800">
              {items.map((p) => (
                <li key={p.id} className="px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-gray-900 dark:text-slate-50 truncate">{p.nombre}</p>
                    <p className="text-xs text-gray-600 dark:text-slate-400">
                      {p.codigo || 'Sin código'} · Stock {fmtCantidadStock(p.stock_actual, p.unidad_medida)}
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
                </li>
              ))}
            </ul>

            <div className="shrink-0 px-5 py-3 border-t border-gray-100 dark:border-slate-700">
              <Link
                to="/productos"
                onClick={() => setAbierto(false)}
                className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300"
              >
                Ir a Productos
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default AlertaVencimientos
