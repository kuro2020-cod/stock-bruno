import { useEffect, useState } from 'react'
import { Banknote, AlertCircle } from 'lucide-react'

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/**
 * Modal obligatorio de inicio de caja al entrar a Ventas.
 * USER: monto fijo = fondo del turno anterior (no editable).
 * ADMIN: puede modificar el monto.
 */
export default function InicioCajaModal({
  sugerido = null,
  onConfirm,
  submitting,
  puedeEditarMonto = true
}) {
  const [monto, setMonto] = useState(() => {
    if (!puedeEditarMonto) {
      return sugerido != null && Number(sugerido) >= 0 ? String(sugerido) : '0'
    }
    return sugerido != null && Number(sugerido) >= 0 ? String(sugerido) : ''
  })
  const [error, setError] = useState('')

  useEffect(() => {
    if (!puedeEditarMonto) {
      setMonto(sugerido != null && Number(sugerido) >= 0 ? String(sugerido) : '0')
      return
    }
    if (sugerido != null && Number(sugerido) >= 0 && String(monto).trim() === '') {
      setMonto(String(sugerido))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sugerido, puedeEditarMonto])

  const confirmar = () => {
    setError('')
    if (!puedeEditarMonto) {
      const fijo =
        sugerido != null && Number.isFinite(Number(sugerido)) && Number(sugerido) >= 0
          ? Number(sugerido)
          : 0
      onConfirm(Math.round(fijo * 100) / 100)
      return
    }

    const raw = String(monto)
      .trim()
      .replace(',', '.')
    if (!raw) {
      setError('Indicá con cuánto dinero inicia la caja')
      return
    }
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n < 0) {
      setError('El monto debe ser un número válido (0 o más)')
      return
    }
    onConfirm(Math.round(n * 100) / 100)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="inicio-caja-titulo"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white">
          <h3 id="inicio-caja-titulo" className="text-lg font-semibold flex items-center gap-2">
            <Banknote size={22} />
            Inicio de caja
          </h3>
          <p className="text-sm text-emerald-50/95 mt-1">
            {puedeEditarMonto
              ? 'Indicá con cuánto efectivo cuenta la caja al comenzar el turno.'
              : 'Confirmá el inicio de caja con el fondo dejado por el turno anterior.'}
          </p>
        </div>

        <div className="px-5 py-5 space-y-4">
          {sugerido != null && Number(sugerido) >= 0 && (
            <p className="text-sm text-gray-600 rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2">
              Fondo dejado por el turno anterior:{' '}
              <strong className="tabular-nums text-emerald-900">{fmtMoney(sugerido)}</strong>
            </p>
          )}

          <div>
            <label htmlFor="monto-inicio-caja" className="text-xs font-medium text-gray-600 block mb-1">
              Monto de inicio
            </label>
            <input
              id="monto-inicio-caja"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              autoFocus={puedeEditarMonto}
              readOnly={!puedeEditarMonto}
              tabIndex={puedeEditarMonto ? 0 : -1}
              placeholder="0,00"
              value={monto}
              onChange={(e) => {
                if (!puedeEditarMonto) return
                setMonto(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  confirmar()
                }
              }}
              className={`w-full px-3 py-2.5 border-2 rounded-xl text-lg font-semibold tabular-nums ${
                puedeEditarMonto
                  ? 'border-emerald-200 focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400 bg-white'
                  : 'border-gray-200 bg-gray-100 text-gray-700 cursor-not-allowed'
              }`}
            />
          </div>

          {error ? (
            <p className="flex items-start gap-2 text-sm text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              {error}
            </p>
          ) : (
            <p className="text-[11px] text-gray-500">
              {puedeEditarMonto
                ? 'Este monto quedará registrado y se mostrará al cerrar la caja.'
                : 'El monto no se puede modificar. Solo un administrador puede cambiarlo.'}
            </p>
          )}

          <button
            type="button"
            disabled={submitting}
            onClick={confirmar}
            className="w-full px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Confirmar inicio de caja'}
          </button>
        </div>
      </div>
    </div>
  )
}
