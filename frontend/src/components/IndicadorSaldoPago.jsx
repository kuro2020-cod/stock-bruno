/**
 * Banner visible para vuelto / falta / completo / sobra en cobros.
 * variant: 'vuelto' | 'falta' | 'exacto' | 'completo' | 'sobra'
 */
export default function IndicadorSaldoPago({ variant, titulo, monto, detalle }) {
  const estilos = {
    vuelto: 'border-emerald-400 bg-emerald-100 text-emerald-950',
    exacto: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    completo: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    falta: 'border-amber-400 bg-amber-100 text-amber-950',
    sobra: 'border-red-300 bg-red-50 text-red-900'
  }

  const montoClase = {
    vuelto: 'text-emerald-800',
    exacto: 'text-emerald-800',
    completo: 'text-emerald-800',
    falta: 'text-amber-900',
    sobra: 'text-red-800'
  }

  return (
    <div
      className={`rounded-xl border-2 px-3 py-2.5 ${estilos[variant] || estilos.falta}`}
      role="status"
    >
      <p className="text-[11px] font-bold uppercase tracking-wide opacity-80">{titulo}</p>
      {monto != null && (
        <p className={`text-2xl font-extrabold tabular-nums leading-tight mt-0.5 ${montoClase[variant] || ''}`}>
          {monto}
        </p>
      )}
      {detalle ? <p className="text-xs mt-1 opacity-90">{detalle}</p> : null}
    </div>
  )
}
