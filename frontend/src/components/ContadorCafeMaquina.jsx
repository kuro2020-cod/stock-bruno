import { useState } from 'react'
import { Coffee, AlertTriangle, ChevronDown } from 'lucide-react'

const fmtU = (n) =>
  Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 3 })

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Contador mensual de café máquina + alerta a umbral + detalle de montos + historial.
 * @param {{ resumen: object, compact?: boolean, showHistorial?: boolean }} props
 */
export default function ContadorCafeMaquina({ resumen, compact = false, showHistorial = true }) {
  const [histOpen, setHistOpen] = useState(false)
  if (!resumen?.actual) return null

  const { actual, historial = [], umbral, detalleVentas } = resumen
  const exceso = Boolean(actual.exceso)
  const pct = Math.min(100, Number(actual.porcentaje || 0))
  const cafeSuelto = detalleVentas?.cafeSuelto
  const cafeMalo = detalleVentas?.cafeMalo
  const promoCafe = detalleVentas?.promoCafe
  const totalCobrado = detalleVentas?.totalCobrado
  const mostrarDetalle = Boolean(detalleVentas)

  const etiquetaUnidades = (n) => {
    const u = Number(n || 0)
    return `${fmtU(u)} ${u === 1 ? 'unidad' : 'unidades'}`
  }
  const etiquetaPromociones = (n) => {
    const u = Number(n || 0)
    return `${fmtU(u)} ${u === 1 ? 'promoción' : 'promociones'}`
  }

  return (
    <div
      className={`rounded-xl border p-4 sm:p-5 ${
        exceso
          ? 'border-rose-400 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-500/50'
          : 'border-amber-200 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-500/40'
      }`}
    >
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-amber-900/80 dark:text-amber-200 flex items-center gap-1.5">
                <Coffee size={16} className="shrink-0" />
                Café máquina · {actual.mesLabel || actual.mes}
              </p>
              <p
                className={`font-extrabold tabular-nums mt-1 leading-none ${
                  compact ? 'text-3xl' : 'text-4xl'
                } ${exceso ? 'text-rose-700 dark:text-rose-300' : 'text-amber-950 dark:text-amber-100'}`}
              >
                {fmtU(actual.unidades)}
                <span className="text-base font-semibold text-amber-800/70 dark:text-amber-300/80 ml-1">
                  / {fmtU(umbral || actual.umbral)}
                </span>
              </p>
              <p className="text-xs text-amber-900/70 dark:text-amber-200/70 mt-2">
                {actual.movimientos || 0} venta(s)
                {actual.desdeReinicio ? ' desde el último reinicio' : ' este mes'}
                {!exceso
                  ? ` · Restan ${fmtU(actual.restante)} para el límite`
                  : ` · Exceso de ${fmtU(actual.excedente)}`}
              </p>
            </div>
            {exceso && (
              <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold uppercase tracking-wide">
                <AlertTriangle size={14} />
                Exceso
              </div>
            )}
          </div>

          <div className="mt-3 h-2.5 rounded-full bg-amber-200/80 dark:bg-amber-900/50 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${exceso ? 'bg-rose-600' : 'bg-amber-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {mostrarDetalle && (
          <div
            className={`sm:w-64 shrink-0 rounded-lg border px-3.5 py-3 space-y-2.5 ${
              exceso
                ? 'border-rose-200 bg-white/70 dark:bg-rose-950/30 dark:border-rose-500/40'
                : 'border-amber-200/90 bg-white/70 dark:bg-amber-950/40 dark:border-amber-600/40'
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-amber-900/80 dark:text-amber-200">
              Detalle ventas
            </p>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-semibold text-amber-950 dark:text-amber-100 truncate">
                  Café máquina
                </p>
                <p className="text-sm font-medium text-amber-900/85 dark:text-amber-100/85">
                  {etiquetaUnidades(cafeSuelto?.unidades)}
                </p>
              </div>
              <p className="text-base tabular-nums font-bold text-amber-950 dark:text-amber-100 shrink-0">
                {fmtMoney(cafeSuelto?.total)}
              </p>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-semibold text-amber-950 dark:text-amber-100 truncate">
                  Café máquina malo
                </p>
                <p className="text-sm font-medium text-amber-900/85 dark:text-amber-100/85">
                  {etiquetaUnidades(cafeMalo?.unidades)}
                </p>
              </div>
              <p className="text-base tabular-nums font-bold text-amber-950 dark:text-amber-100 shrink-0">
                {fmtMoney(cafeMalo?.total)}
              </p>
            </div>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-base font-semibold text-amber-950 dark:text-amber-100 truncate">
                  Promo café
                </p>
                <p className="text-sm font-medium text-amber-900/85 dark:text-amber-100/85">
                  {etiquetaPromociones(promoCafe?.ventas)}
                </p>
              </div>
              <p className="text-base tabular-nums font-bold text-amber-950 dark:text-amber-100 shrink-0">
                {fmtMoney(promoCafe?.total)}
              </p>
            </div>
            <div className="pt-2 border-t border-amber-200/80 dark:border-amber-700/50 flex items-center justify-between gap-2">
              <p className="text-sm font-bold uppercase tracking-wide text-amber-900/80 dark:text-amber-200">
                Total
              </p>
              <p className="text-lg tabular-nums font-extrabold text-amber-950 dark:text-amber-50">
                {fmtMoney(totalCobrado)}
              </p>
            </div>
          </div>
        )}
      </div>

      {exceso && (
        <p className="mt-3 text-sm font-semibold text-rose-800 dark:text-rose-200">
          Alerta: se superó el límite de {fmtU(umbral || actual.umbral)} cafés máquina en el mes.
        </p>
      )}

      {showHistorial && Array.isArray(historial) && historial.length > 0 && (
        <div className="mt-4 pt-3 border-t border-amber-200/80 dark:border-amber-700/50">
          <button
            type="button"
            onClick={() => setHistOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
          >
            <span className="text-[11px] font-bold uppercase tracking-wide text-amber-900/60 dark:text-amber-300/70">
              Historial mensual
            </span>
            <ChevronDown
              size={16}
              className={`shrink-0 text-amber-800/70 dark:text-amber-300/80 transition-transform ${
                histOpen ? 'rotate-180' : ''
              }`}
            />
          </button>
          {histOpen && (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto mt-2">
              {historial.map((h) => (
                <li
                  key={h.mes}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="text-amber-950/80 dark:text-amber-100/90 truncate">
                    {h.mesLabel || h.mes}
                  </span>
                  <span
                    className={`tabular-nums font-semibold shrink-0 ${
                      h.exceso
                        ? 'text-rose-700 dark:text-rose-300'
                        : 'text-amber-900 dark:text-amber-200'
                    }`}
                  >
                    {fmtU(h.unidades)}
                    {h.exceso ? ' ⚠' : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
