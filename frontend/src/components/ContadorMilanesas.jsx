import { useState } from 'react'
import { Drumstick, Sandwich, Cookie, Cigarette, ChevronDown, Tag, Trash2 } from 'lucide-react'

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`

const fmtU = (n) =>
  Number(n || 0).toLocaleString('es-ES', { maximumFractionDigits: 3 })

const TEMAS = {
  sky: {
    box: 'border-sky-200 bg-sky-50/70 dark:bg-sky-950/30 dark:border-sky-500/40',
    title: 'text-sky-900/80 dark:text-sky-200',
    value: 'text-sky-950 dark:text-sky-100',
    meta: 'text-sky-900/70 dark:text-sky-200/70',
    border: 'border-sky-200/80 dark:border-sky-700/50',
    histTitle: 'text-sky-900/60 dark:text-sky-300/70',
    histLabel: 'text-sky-950/80 dark:text-sky-100/90',
    histValue: 'text-sky-900 dark:text-sky-200'
  },
  emerald: {
    box: 'border-emerald-200 bg-emerald-50/70 dark:bg-emerald-950/30 dark:border-emerald-500/40',
    title: 'text-emerald-900/80 dark:text-emerald-200',
    value: 'text-emerald-950 dark:text-emerald-100',
    meta: 'text-emerald-900/70 dark:text-emerald-200/70',
    border: 'border-emerald-200/80 dark:border-emerald-700/50',
    histTitle: 'text-emerald-900/60 dark:text-emerald-300/70',
    histLabel: 'text-emerald-950/80 dark:text-emerald-100/90',
    histValue: 'text-emerald-900 dark:text-emerald-200'
  },
  amber: {
    box: 'border-amber-200 bg-amber-50/70 dark:bg-amber-950/30 dark:border-amber-500/40',
    title: 'text-amber-900/80 dark:text-amber-200',
    value: 'text-amber-950 dark:text-amber-100',
    meta: 'text-amber-900/70 dark:text-amber-200/70',
    border: 'border-amber-200/80 dark:border-amber-700/50',
    histTitle: 'text-amber-900/60 dark:text-amber-300/70',
    histLabel: 'text-amber-950/80 dark:text-amber-100/90',
    histValue: 'text-amber-900 dark:text-amber-200'
  },
  slate: {
    box: 'border-slate-200 bg-slate-50/80 dark:bg-slate-900/40 dark:border-slate-500/40',
    title: 'text-slate-800/80 dark:text-slate-200',
    value: 'text-slate-950 dark:text-slate-100',
    meta: 'text-slate-700/70 dark:text-slate-300/70',
    border: 'border-slate-200/80 dark:border-slate-600/50',
    histTitle: 'text-slate-700/60 dark:text-slate-400/70',
    histLabel: 'text-slate-900/80 dark:text-slate-100/90',
    histValue: 'text-slate-800 dark:text-slate-200'
  },
  violet: {
    box: 'border-violet-200 bg-violet-50/70 dark:bg-violet-950/30 dark:border-violet-500/40',
    title: 'text-violet-900/80 dark:text-violet-200',
    value: 'text-violet-950 dark:text-violet-100',
    meta: 'text-violet-900/70 dark:text-violet-200/70',
    border: 'border-violet-200/80 dark:border-violet-700/50',
    histTitle: 'text-violet-900/60 dark:text-violet-300/70',
    histLabel: 'text-violet-950/80 dark:text-violet-100/90',
    histValue: 'text-violet-900 dark:text-violet-200'
  },
  rose: {
    box: 'border-rose-200 bg-rose-50/70 dark:bg-rose-950/30 dark:border-rose-500/40',
    title: 'text-rose-900/80 dark:text-rose-200',
    value: 'text-rose-950 dark:text-rose-100',
    meta: 'text-rose-900/70 dark:text-rose-200/70',
    border: 'border-rose-200/80 dark:border-rose-700/50',
    histTitle: 'text-rose-900/60 dark:text-rose-300/70',
    histLabel: 'text-rose-950/80 dark:text-rose-100/90',
    histValue: 'text-rose-900 dark:text-rose-200'
  },
  indigo: {
    box: 'border-indigo-200 bg-indigo-50/70 dark:bg-indigo-950/30 dark:border-indigo-500/40',
    title: 'text-indigo-900/80 dark:text-indigo-200',
    value: 'text-indigo-950 dark:text-indigo-100',
    meta: 'text-indigo-900/70 dark:text-indigo-200/70',
    border: 'border-indigo-200/80 dark:border-indigo-700/50',
    histTitle: 'text-indigo-900/60 dark:text-indigo-300/70',
    histLabel: 'text-indigo-950/80 dark:text-indigo-100/90',
    histValue: 'text-indigo-900 dark:text-indigo-200'
  }
}

/**
 * Contador por jornada (corte 06:00) + historial de reinicios.
 * @param {{ resumen: object, titulo?: string, tema?: string, icon?: any, compact?: boolean, showHistorial?: boolean, detalleItems?: Array<{ key: string, label: string, unidades?: number, total?: number }> }} props
 */
export default function ContadorRubroJornada({
  resumen,
  titulo = 'Rubro',
  tema = 'sky',
  icon: Icon = Drumstick,
  compact = false,
  showHistorial = true,
  detalleItems = null,
  mostrarUnidades = true,
  reinicioTexto = null,
  onEliminar = null
}) {
  const [histOpen, setHistOpen] = useState(false)
  if (!resumen?.actual) return null

  const { actual, historial = [], horaCorte = 6 } = resumen
  const historialVisible = (historial || []).filter(
    (h) => Number(h.monto || 0) > 0 || Number(h.unidades || 0) > 0
  )
  const totalHistorial = historialVisible.reduce((s, h) => s + (Number(h.monto) || 0), 0)
  const totalAcumulado = totalHistorial + (Number(actual.monto) || 0)
  const t = TEMAS[tema] || TEMAS.sky
  const itemsDetalle = Array.isArray(detalleItems) ? detalleItems : null
  const totalDetalle =
    itemsDetalle?.reduce((s, it) => s + (Number(it.total) || 0), 0) ?? null

  return (
    <div className={`rounded-xl border p-4 sm:p-5 ${t.box}`}>
      <div className="flex flex-col sm:flex-row sm:items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className={`text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 ${t.title}`}
              >
                <Icon size={16} className="shrink-0" />
                {titulo} · {actual.jornadaLabel || 'Jornada actual'}
              </p>
              <p
                className={`font-extrabold tabular-nums mt-1 leading-none ${t.value} ${
                  compact ? 'text-3xl' : 'text-4xl'
                }`}
              >
                {fmtMoney(actual.monto)}
              </p>
              <p className={`text-xs mt-2 ${t.meta}`}>
                {actual.movimientos || 0} venta(s)
                {mostrarUnidades ? ` · ${fmtU(actual.unidades)} unidad(es)` : ''}
                {` · ${
                  reinicioTexto || `Se reinicia a las ${String(horaCorte).padStart(2, '0')}:00`
                }`}
              </p>
            </div>
            {typeof onEliminar === 'function' && (
              <button
                type="button"
                onClick={onEliminar}
                className={`shrink-0 p-1.5 rounded-lg hover:bg-white/70 dark:hover:bg-black/20 ${t.meta}`}
                title="Quitar contador"
                aria-label="Quitar contador"
              >
                <Trash2 size={16} />
              </button>
            )}
          </div>
        </div>

        {itemsDetalle && (
          <div
            className={`sm:w-64 shrink-0 rounded-lg border px-3.5 py-3 space-y-2.5 bg-white/70 dark:bg-black/20 ${t.border}`}
          >
            <p className={`text-xs font-bold uppercase tracking-wide ${t.histTitle}`}>
              Detalle ventas
            </p>
            {itemsDetalle.map((it) => (
              <div key={it.key} className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-base font-semibold truncate ${t.histLabel}`}>{it.label}</p>
                </div>
                <p className={`text-base tabular-nums font-bold shrink-0 ${t.histValue}`}>
                  {fmtMoney(it.total)}
                </p>
              </div>
            ))}
            <div className={`pt-2 border-t flex items-center justify-between gap-2 ${t.border}`}>
              <p className={`text-sm font-bold uppercase tracking-wide ${t.histTitle}`}>Total</p>
              <p className={`text-lg tabular-nums font-extrabold ${t.value}`}>
                {fmtMoney(totalDetalle)}
              </p>
            </div>
          </div>
        )}
      </div>

      {showHistorial && (
        <div className={`mt-4 pt-3 border-t ${t.border}`}>
          {historialVisible.length > 0 && (
            <button
              type="button"
              onClick={() => setHistOpen((v) => !v)}
              className="w-full flex items-center justify-between gap-2 text-left"
            >
              <span className={`text-[11px] font-bold uppercase tracking-wide ${t.histTitle}`}>
                Historial de reinicios
              </span>
              <ChevronDown
                size={16}
                className={`shrink-0 ${t.histTitle} transition-transform ${histOpen ? 'rotate-180' : ''}`}
              />
            </button>
          )}
          {histOpen && historialVisible.length > 0 && (
            <ul className="space-y-1.5 max-h-48 overflow-y-auto mt-2">
              {historialVisible.map((h) => (
                <li key={h.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className={`truncate ${t.histLabel}`}>{h.label}</span>
                  <span className={`tabular-nums font-semibold shrink-0 ${t.histValue}`}>
                    {fmtMoney(h.monto)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div
            className={`flex items-center justify-between gap-2 ${
              historialVisible.length > 0 ? 'mt-2 pt-2 border-t' : ''
            } ${t.border}`}
          >
            <span className={`text-[11px] font-bold uppercase tracking-wide ${t.histTitle}`}>
              Total
            </span>
            <span className={`tabular-nums font-extrabold ${t.value}`}>
              {fmtMoney(totalAcumulado)}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export function ContadorMilanesas({ resumen, ...props }) {
  const d = resumen?.detalleVentas
  const detalleItems = d
    ? [
        {
          key: 'carne',
          label: 'Milanesas de carne',
          unidades: d.milanesasCarne?.unidades,
          total: d.milanesasCarne?.total
        },
        {
          key: 'pollo',
          label: 'Milanesas de pollo',
          unidades: d.milanesasPollo?.unidades,
          total: d.milanesasPollo?.total
        },
        {
          key: 'sandwich',
          label: 'Sandwich / sánguche milanesa',
          unidades: d.sandwichMilanesas?.unidades,
          total: d.sandwichMilanesas?.total
        },
        {
          key: 'rollitos',
          label: 'Rollitos jamón y queso',
          unidades: d.rollitosJamonQueso?.unidades,
          total: d.rollitosJamonQueso?.total
        }
      ]
    : null

  return (
    <ContadorRubroJornada
      {...props}
      resumen={resumen}
      titulo="Milanesas"
      tema="sky"
      icon={Drumstick}
      detalleItems={detalleItems}
      mostrarUnidades={false}
    />
  )
}

export function ContadorSandwichMilanesas(props) {
  return (
    <ContadorRubroJornada {...props} titulo="Sandwich milanesas" tema="emerald" icon={Sandwich} />
  )
}

export function ContadorRollitosJamonQueso(props) {
  return (
    <ContadorRubroJornada
      {...props}
      titulo="Rollitos jamón y queso"
      tema="amber"
      icon={Cookie}
    />
  )
}

export function ContadorCigarrillos(props) {
  return <ContadorRubroJornada {...props} titulo="Cigarrillos" tema="slate" icon={Cigarette} />
}

const TEMAS_CATEGORIA = ['violet', 'rose', 'indigo', 'amber', 'emerald']

export function ContadorCategoria({ resumen, tema, onEliminar, ...props }) {
  const idx = Number(resumen?.id || 0)
  const temaAuto = TEMAS_CATEGORIA[idx % TEMAS_CATEGORIA.length]
  return (
    <ContadorRubroJornada
      {...props}
      resumen={resumen}
      titulo={resumen?.titulo || resumen?.categoriaNombre || 'Categoría'}
      tema={tema || temaAuto}
      icon={Tag}
      reinicioTexto={resumen?.reinicioTexto}
      onEliminar={onEliminar}
    />
  )
}
