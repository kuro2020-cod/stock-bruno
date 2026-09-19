import { X, CheckCircle } from 'lucide-react'
import IndicadorSaldoPago from './IndicadorSaldoPago'
import { fmtMoney } from '../utils/promociones'

const LABELS = {
  efectivo: 'Efectivo',
  transferencia: 'Transferencia',
  tarjeta: 'Tarjeta',
  fiado: 'Fiado'
}

export default function DetallePagoModal({
  open,
  total,
  esDevolucionEnvase,
  submitting,
  metodosSeleccionados,
  metodoUnico,
  pagoCombinado,
  montosPago,
  setMontosPago,
  montoRecibidoEfectivo,
  setMontoRecibidoEfectivo,
  nombreDueno,
  setNombreDueno,
  montoRecibidoNum,
  vueltoEfectivo,
  indicadorCombinado,
  montoFiadoCombinado,
  renderCampoFiado,
  error,
  confirmarDeshabilitado,
  onClose,
  onConfirm
}) {
  if (!open) return null

  const titulo =
    metodoUnico === 'retiro'
      ? 'Retiro de mercadería'
      : metodoUnico === 'fiado'
        ? 'Fiado'
        : metodoUnico === 'efectivo'
          ? 'Efectivo'
          : 'Pago combinado'

  const esFiado = metodoUnico === 'fiado' || (pagoCombinado && metodosSeleccionados.includes('fiado'))

  return (
    <div
      className="fixed inset-0 z-[110] flex justify-center sm:items-center bg-black/55 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`bg-white dark:bg-slate-900 w-full h-dvh max-h-dvh overflow-hidden flex flex-col shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl ${
          esFiado ? 'max-w-2xl sm:min-h-[36rem]' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalle-pago-titulo"
      >
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <h3
            id="detalle-pago-titulo"
            className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50"
          >
            {titulo}
          </h3>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="shrink-0 px-4 sm:px-6 py-4 text-center border-b border-gray-100 dark:border-slate-700">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
            {metodoUnico === 'retiro' ? 'Valor estimado' : 'Total a pagar'}
          </p>
          <p
            className={`text-3xl sm:text-4xl font-extrabold tabular-nums mt-1 ${
              total < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {fmtMoney(total)}
          </p>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-4 overflow-y-auto flex-1 min-h-0">
          {pagoCombinado && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 dark:text-slate-300 leading-snug">
                {metodosSeleccionados.includes('fiado')
                  ? 'El fiado se completa solo con el total y se va restando cuando cargás otro medio.'
                  : 'Distribuí el total entre los métodos elegidos.'}
                {metodosSeleccionados.includes('efectivo') &&
                  !metodosSeleccionados.includes('fiado') &&
                  metodosSeleccionados.length >= 2 && (
                    <span> Si el efectivo es de más, el excedente se muestra como vuelto.</span>
                  )}
              </p>
              {metodosSeleccionados.map((key) => {
                const esFiadoAuto = key === 'fiado'
                return (
                  <div key={key} className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-slate-300 w-[7.5rem] shrink-0 font-medium">
                      {esFiadoAuto ? 'Fiado (resto)' : LABELS[key] || key}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      placeholder="0"
                      autoFocus={key === metodosSeleccionados[0]}
                      value={montosPago[key]}
                      readOnly={esFiadoAuto}
                      onChange={(e) => {
                        if (esFiadoAuto) return
                        setMontosPago((prev) => ({ ...prev, [key]: e.target.value }))
                      }}
                      className={`flex-1 min-w-0 px-3 py-2.5 border rounded-lg text-base dark:text-slate-100 ${
                        esFiadoAuto
                          ? 'border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-950/40 cursor-default'
                          : 'border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                      }`}
                    />
                  </div>
                )
              })}
              {montoFiadoCombinado > 0 && renderCampoFiado?.('cliente-fiado-modal')}
              <IndicadorSaldoPago
                variant={indicadorCombinado.variant}
                titulo={indicadorCombinado.titulo}
                monto={indicadorCombinado.monto}
                detalle={indicadorCombinado.detalle}
              />
            </div>
          )}

          {metodoUnico === 'retiro' && (
            <div className="space-y-3">
              <p className="text-sm text-amber-950 dark:text-amber-100">
                Retiro de mercadería: descuenta stock como «RETIRO DUEÑO». No suma a ventas ni a caja.
              </p>
              <div>
                <label
                  htmlFor="nombre-dueno-retiro"
                  className="text-sm font-medium text-gray-700 dark:text-slate-200 block mb-1"
                >
                  Nombre del dueño
                </label>
                <input
                  id="nombre-dueno-retiro"
                  type="text"
                  autoComplete="off"
                  autoFocus
                  value={nombreDueno}
                  onChange={(e) => setNombreDueno(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    if (submitting || !String(nombreDueno).trim()) return
                    onConfirm()
                  }}
                  placeholder="Nombre del dueño"
                  className="w-full px-3 py-2.5 border border-amber-300 dark:border-amber-700 rounded-lg text-base bg-white dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            </div>
          )}

          {metodoUnico === 'fiado' && (
            <div className="space-y-3">
              <p className="text-sm text-amber-950 dark:text-amber-100">
                Todo el carrito queda en fiado:{' '}
                <strong className="tabular-nums">{fmtMoney(total)}</strong>
              </p>
              {renderCampoFiado?.('cliente-fiado-modal-unico')}
            </div>
          )}

          {metodoUnico === 'efectivo' && !pagoCombinado && (
            <div className="space-y-3">
              {esDevolucionEnvase ? (
                <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  A devolver al cliente: {fmtMoney(Math.abs(total))}
                </p>
              ) : (
                <>
                  <label
                    htmlFor="monto-recibido-modal"
                    className="text-sm font-medium text-gray-600 dark:text-slate-300 block"
                  >
                    Monto con el que paga
                  </label>
                  <input
                    id="monto-recibido-modal"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    autoFocus
                    placeholder="Ej. 2000"
                    value={montoRecibidoEfectivo}
                    onChange={(e) => setMontoRecibidoEfectivo(e.target.value)}
                    className="w-full px-3 py-3 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-900 dark:text-slate-100"
                  />
                  {String(montoRecibidoEfectivo).trim() !== '' && (
                    <IndicadorSaldoPago
                      variant={
                        vueltoEfectivo != null
                          ? vueltoEfectivo <= 0.001
                            ? 'exacto'
                            : 'vuelto'
                          : 'falta'
                      }
                      titulo={
                        vueltoEfectivo != null
                          ? vueltoEfectivo <= 0.001
                            ? 'Pago exacto'
                            : 'Vuelto'
                          : 'Resta pagar'
                      }
                      monto={
                        vueltoEfectivo != null
                          ? vueltoEfectivo <= 0.001
                            ? fmtMoney(0)
                            : fmtMoney(vueltoEfectivo)
                          : !Number.isNaN(montoRecibidoNum)
                            ? fmtMoney(Math.max(0, total - montoRecibidoNum))
                            : null
                      }
                      detalle={
                        vueltoEfectivo != null
                          ? vueltoEfectivo <= 0.001
                            ? 'Sin vuelto'
                            : `Total venta ${fmtMoney(total)}`
                          : Number.isNaN(montoRecibidoNum)
                            ? 'Ingresá un monto válido'
                            : `Total venta ${fmtMoney(total)}`
                      }
                    />
                  )}
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-gray-100 dark:border-slate-700 flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-3.5 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 font-medium"
          >
            Volver
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirmarDeshabilitado}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-white font-semibold disabled:opacity-50 ${
              metodoUnico === 'retiro' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <CheckCircle size={18} />
            {submitting ? 'Registrando…' : metodoUnico === 'retiro' ? 'Confirmar retiro' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </div>
  )
}

export function metodosNecesitanDetalle(metodos, esDevolucionEnvase) {
  if (!metodos?.length) return false
  if (metodos.includes('pedidos_ya')) return false
  if (metodos.includes('retiro')) return true
  if (metodos.length >= 2) return true
  if (metodos[0] === 'fiado') return true
  if (metodos[0] === 'efectivo') return !esDevolucionEnvase
  return false
}
