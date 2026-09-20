import { useEffect, useMemo, useState } from 'react'
import { X, Banknote, Smartphone, Bike, CheckCircle } from 'lucide-react'
import IndicadorSaldoPago from './IndicadorSaldoPago'
import { fmtMoney } from '../utils/promociones'
import {
  parseMontoPago,
  resolverPagosCombinados,
  previewPagosCombinados,
  indicadorPagosCombinados
} from '../utils/pagosCombinados'

const MEDIOS = [
  { key: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { key: 'transferencia', label: 'Transferencia', Icon: Smartphone }
]

const montosVacios = () => ({ efectivo: '', transferencia: '' })

export default function PedidosYaPagoModal({
  open,
  total,
  esDevolucionEnvase,
  submitting = false,
  initialMedios = [],
  initialMontos,
  initialRecibido = '',
  onClose,
  onConfirm
}) {
  const [medios, setMedios] = useState([])
  const [montos, setMontos] = useState(montosVacios)
  const [montoRecibidoEfectivo, setMontoRecibidoEfectivo] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setMedios(Array.isArray(initialMedios) ? [...initialMedios] : [])
    setMontos({
      efectivo: initialMontos?.efectivo ?? '',
      transferencia: initialMontos?.transferencia ?? ''
    })
    setMontoRecibidoEfectivo(initialRecibido || '')
    setError('')
  }, [open, initialMedios, initialMontos, initialRecibido])

  const combinado = medios.length >= 2
  const unico = medios.length === 1 ? medios[0] : ''

  const previewCombinado = useMemo(() => {
    if (!combinado) return null
    return previewPagosCombinados(medios, montos, total)
  }, [combinado, medios, montos, total])

  const resolucionCombinada = useMemo(() => {
    if (!combinado) return null
    const ambosConMonto = medios.every((key) => {
      const v = parseMontoPago(montos[key])
      return !Number.isNaN(v) && v > 0
    })
    if (!ambosConMonto) return null
    return resolverPagosCombinados(medios, montos, total)
  }, [combinado, medios, montos, total])

  const indicadorCombinado = useMemo(
    () => indicadorPagosCombinados(previewCombinado, total, fmtMoney),
    [previewCombinado, total]
  )

  const montoRecibidoNum = parseMontoPago(montoRecibidoEfectivo)
  const vueltoEfectivo =
    unico === 'efectivo' &&
    !combinado &&
    !Number.isNaN(montoRecibidoNum) &&
    montoRecibidoNum >= total
      ? Math.round((montoRecibidoNum - total) * 100) / 100
      : null

  const efectivoOk =
    unico !== 'efectivo' ||
    esDevolucionEnvase ||
    (!Number.isNaN(montoRecibidoNum) &&
      String(montoRecibidoEfectivo).trim() !== '' &&
      montoRecibidoNum + 1e-9 >= total)

  const listo =
    medios.length > 0 &&
    (combinado ? Boolean(resolucionCombinada?.ok) : unico !== 'efectivo' || esDevolucionEnvase || efectivoOk)

  const toggleMedio = (key) => {
    setError('')
    setMedios((prev) => {
      if (prev.includes(key)) {
        setMontos((m) => ({ ...m, [key]: '' }))
        if (key === 'efectivo') setMontoRecibidoEfectivo('')
        return prev.filter((k) => k !== key)
      }
      if (esDevolucionEnvase) {
        setMontos(montosVacios())
        setMontoRecibidoEfectivo('')
        return [key]
      }
      return [...prev, key]
    })
  }

  const confirmar = () => {
    setError('')
    if (medios.length === 0) {
      setError('Seleccioná efectivo, transferencia o ambos.')
      return
    }

    if (combinado) {
      const resolucion = resolverPagosCombinados(medios, montos, total)
      if (!resolucion.ok) {
        setError(
          resolucion.error ||
            (resolucion.estado === 'falta'
              ? `Falta efectivo por ${fmtMoney(resolucion.resta || 0)}.`
              : 'Revisá los importes de cada método.')
        )
        return
      }
      onConfirm({
        medios,
        montos,
        montoRecibidoEfectivo: '',
        pagosResueltos: resolucion.entries
      })
      return
    }

    if (!efectivoOk) {
      setError('Indicá con cuánto paga (debe cubrir el total).')
      return
    }

    onConfirm({
      medios,
      montos: montosVacios(),
      montoRecibidoEfectivo: unico === 'efectivo' ? montoRecibidoEfectivo : '',
      pagosResueltos: null
    })
  }

  if (!open) return null

  return (
    <div
      className="modal-scrim fixed inset-0 z-[110] flex justify-center sm:items-center sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-lg h-dvh max-h-dvh overflow-hidden flex flex-col shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pedidos-ya-titulo"
      >
        <div className="shrink-0 px-4 sm:px-6 py-4 border-b border-rose-100 dark:border-rose-900/50 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Bike className="text-rose-600 dark:text-rose-300 shrink-0" size={22} />
            <h3 id="pedidos-ya-titulo" className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-slate-50 truncate">
              Pedidos Ya
            </h3>
          </div>
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
            Total Pedidos Ya
          </p>
          <p
            className={`text-3xl sm:text-4xl font-extrabold tabular-nums mt-1 ${
              total < 0 ? 'text-red-600 dark:text-red-300' : 'text-rose-700 dark:text-rose-300'
            }`}
          >
            {fmtMoney(total)}
          </p>
        </div>

        <div className="px-4 sm:px-6 py-5 space-y-5 overflow-y-auto flex-1 min-h-0">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            ¿Cómo te pagó Pedidos Ya? Elegí efectivo, transferencia o ambos. El efectivo suma a la caja
            igual que una venta común.
          </p>

          {esDevolucionEnvase && (
            <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700 rounded-lg px-3 py-2">
              Devolución de envase: elegí un solo medio para devolver el dinero.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            {MEDIOS.map(({ key, label, Icon }) => {
              const activo = medios.includes(key)
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleMedio(key)}
                  className={`flex flex-col items-center justify-center gap-2 rounded-2xl border-2 px-3 py-6 transition-colors ${
                    activo
                      ? 'border-rose-500 bg-rose-50 text-rose-950 dark:bg-rose-950/40 dark:text-rose-100 dark:border-rose-400'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-rose-300 hover:bg-rose-50/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200'
                  }`}
                >
                  <Icon size={30} className={activo ? 'text-rose-600 dark:text-rose-300' : ''} />
                  <span className="text-sm font-bold uppercase tracking-wide">{label}</span>
                </button>
              )
            })}
          </div>

          {combinado && (
            <div className="space-y-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/60 p-4">
              <p className="text-sm text-gray-500 dark:text-slate-400">
                Distribuí el total entre efectivo y transferencia. Si el efectivo es de más, el excedente
                se muestra como vuelto (solo entra a caja el neto).
              </p>
              {medios.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <label className="text-sm text-gray-600 dark:text-slate-300 w-[8.5rem] shrink-0 font-medium">
                    {key === 'efectivo' ? 'Efectivo' : 'Transferencia'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    placeholder="0"
                    value={montos[key]}
                    onChange={(e) => setMontos((prev) => ({ ...prev, [key]: e.target.value }))}
                    className="flex-1 min-w-0 px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-lg text-base bg-white dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              ))}
              <IndicadorSaldoPago
                variant={indicadorCombinado.variant}
                titulo={indicadorCombinado.titulo}
                monto={indicadorCombinado.monto}
                detalle={indicadorCombinado.detalle}
              />
            </div>
          )}

          {unico === 'efectivo' && (
            <div className="space-y-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800/60 p-4">
              {esDevolucionEnvase ? (
                <p className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                  A devolver al cliente: {fmtMoney(Math.abs(total))}
                </p>
              ) : (
                <>
                  <label
                    htmlFor="pedidos-ya-recibido"
                    className="text-sm font-medium text-gray-600 dark:text-slate-300 block"
                  >
                    Monto en efectivo que entrega
                  </label>
                  <input
                    id="pedidos-ya-recibido"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
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
                            ? 'Sin vuelto · entra a caja el total'
                            : `Entra a caja ${fmtMoney(total)}`
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

          {unico === 'transferencia' && (
            <p className="text-sm text-gray-600 dark:text-slate-300 rounded-xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/60 px-3 py-2.5">
              Se registra como transferencia (no suma efectivo a caja). Si está Mercado Pago, después se
              verifica el cobro.
            </p>
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
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={!listo || submitting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold disabled:opacity-50"
          >
            <CheckCircle size={18} />
            {submitting ? 'Registrando…' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </div>
  )
}
