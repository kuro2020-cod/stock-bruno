import { useEffect, useMemo, useState } from 'react'
import { X, Banknote, Smartphone, CreditCard, BookUser, CheckCircle, PackageMinus, Bike } from 'lucide-react'
import PedidosYaPagoModal from './PedidosYaPagoModal'
import DetallePagoModal, { metodosNecesitanDetalle } from './DetallePagoModal'
import { fmtMoney } from '../utils/promociones'
import {
  parseMontoPago,
  formatMontoInput,
  restoComoFiado,
  resolverPagosCombinados,
  previewPagosCombinados,
  indicadorPagosCombinados
} from '../utils/pagosCombinados'

const montosVacios = () => ({
  efectivo: '',
  transferencia: '',
  tarjeta: '',
  fiado: ''
})

const METODOS = [
  { key: 'efectivo', label: 'Efectivo', Icon: Banknote },
  { key: 'transferencia', label: 'Transferencia', Icon: Smartphone },
  { key: 'tarjeta', label: 'Tarjeta', Icon: CreditCard },
  { key: 'fiado', label: 'Fiado', Icon: BookUser },
  { key: 'pedidos_ya', label: 'Pedidos Ya', Icon: Bike },
  { key: 'retiro', label: 'Retiro', Icon: PackageMinus }
]

const pedidosYaVacio = () => ({
  medios: [],
  montos: { efectivo: '', transferencia: '' },
  montoRecibidoEfectivo: '',
  pagosResueltos: null
})

export default function CobrarVentaModal({
  open,
  total,
  esDevolucionEnvase,
  submitting,
  onClose,
  onConfirm,
  renderCampoFiado
}) {
  const [metodosSeleccionados, setMetodosSeleccionados] = useState([])
  const [montosPago, setMontosPago] = useState(montosVacios)
  const [montoRecibidoEfectivo, setMontoRecibidoEfectivo] = useState('')
  const [nombreDueno, setNombreDueno] = useState('')
  const [error, setError] = useState('')
  const [showPedidosYaModal, setShowPedidosYaModal] = useState(false)
  const [showDetallePago, setShowDetallePago] = useState(false)
  const [pedidosYaConfig, setPedidosYaConfig] = useState(pedidosYaVacio)

  const pagoCombinado = metodosSeleccionados.length >= 2
  const metodoUnico = metodosSeleccionados.length === 1 ? metodosSeleccionados[0] : ''

  useEffect(() => {
    if (!open) return
    setMetodosSeleccionados([])
    setMontosPago(montosVacios())
    setMontoRecibidoEfectivo('')
    setNombreDueno('')
    setError('')
    setShowPedidosYaModal(false)
    setShowDetallePago(false)
    setPedidosYaConfig(pedidosYaVacio())
  }, [open])

  useEffect(() => {
    if (!open || !metodosSeleccionados.includes('fiado')) return
    const resto = restoComoFiado(metodosSeleccionados, montosPago, total)
    const next = formatMontoInput(resto)
    setMontosPago((prev) => (prev.fiado === next ? prev : { ...prev, fiado: next }))
  }, [
    open,
    total,
    metodosSeleccionados,
    montosPago.efectivo,
    montosPago.transferencia,
    montosPago.tarjeta
  ])

  const metodosDisponibles = useMemo(() => {
    if (esDevolucionEnvase) return METODOS.filter((m) => m.key !== 'fiado')
    return METODOS
  }, [esDevolucionEnvase])

  const previewCombinado = useMemo(() => {
    if (!pagoCombinado) return null
    return previewPagosCombinados(metodosSeleccionados, montosPago, total)
  }, [pagoCombinado, metodosSeleccionados, montosPago, total])

  const resolucionCombinada = useMemo(() => {
    if (!pagoCombinado) return null
    const otros = metodosSeleccionados.filter((key) => key !== 'fiado')
    const tieneOtros = otros.length === 0 || otros.every((key) => {
      const v = parseMontoPago(montosPago[key])
      return !Number.isNaN(v) && v > 0
    })
    if (!tieneOtros) return null
    if (metodosSeleccionados.includes('fiado') && otros.length === 0) return null
    return resolverPagosCombinados(metodosSeleccionados, montosPago, total)
  }, [pagoCombinado, metodosSeleccionados, montosPago, total])

  const indicadorCombinado = useMemo(
    () => indicadorPagosCombinados(previewCombinado, total, fmtMoney),
    [previewCombinado, total]
  )

  const montoRecibidoNum = parseMontoPago(montoRecibidoEfectivo)
  const vueltoEfectivo =
    metodoUnico === 'efectivo' &&
    !pagoCombinado &&
    !Number.isNaN(montoRecibidoNum) &&
    montoRecibidoNum >= total
      ? Math.round((montoRecibidoNum - total) * 100) / 100
      : null

  const efectivoOk =
    metodoUnico !== 'efectivo' ||
    esDevolucionEnvase ||
    (!Number.isNaN(montoRecibidoNum) &&
      String(montoRecibidoEfectivo).trim() !== '' &&
      montoRecibidoNum + 1e-9 >= total)

  const pagoCombinadoListo = Boolean(resolucionCombinada?.ok)
  const pagoUnicoListo =
    !pagoCombinado &&
    (metodoUnico !== 'efectivo' || esDevolucionEnvase || efectivoOk)

  const pedidosYaListo = Boolean(pedidosYaConfig.medios?.length)
  const confirmarDeshabilitado =
    submitting ||
    metodosSeleccionados.length === 0 ||
    (metodoUnico === 'pedidos_ya'
      ? !pedidosYaListo
      : pagoCombinado
        ? !pagoCombinadoListo
        : !pagoUnicoListo) ||
    (metodoUnico === 'retiro' && !String(nombreDueno).trim())

  const montoFiadoCombinado = useMemo(() => {
    if (!metodosSeleccionados.includes('fiado')) return 0
    const v = parseMontoPago(montosPago.fiado)
    return Number.isNaN(v) ? 0 : v
  }, [montosPago.fiado, metodosSeleccionados])

  const requiereNombreFiado =
    metodoUnico === 'fiado' || (pagoCombinado && montoFiadoCombinado > 0)

  const esMetodoExclusivo = (key) => key === 'retiro' || key === 'pedidos_ya'

  const toggleMetodo = (key) => {
    setError('')
    setMetodosSeleccionados((prev) => {
      let next
      if (prev.includes(key)) {
        setMontosPago((m) => ({ ...m, [key]: '' }))
        if (key === 'efectivo') setMontoRecibidoEfectivo('')
        if (key === 'pedidos_ya') {
          setShowPedidosYaModal(false)
          setPedidosYaConfig(pedidosYaVacio())
        }
        next = prev.filter((k) => k !== key)
      } else if (
        esMetodoExclusivo(key) ||
        prev.includes('retiro') ||
        prev.includes('pedidos_ya') ||
        esDevolucionEnvase
      ) {
        setMontosPago(montosVacios())
        setMontoRecibidoEfectivo('')
        if (key === 'pedidos_ya') {
          setShowPedidosYaModal(true)
        } else {
          setShowPedidosYaModal(false)
          setPedidosYaConfig(pedidosYaVacio())
        }
        next = [key]
      } else {
        if (key === 'pedidos_ya') {
          setShowPedidosYaModal(true)
        }
        next = [...prev, key]
      }

      if (key !== 'pedidos_ya' && metodosNecesitanDetalle(next, esDevolucionEnvase)) {
        setShowDetallePago(true)
      } else if (!metodosNecesitanDetalle(next, esDevolucionEnvase)) {
        setShowDetallePago(false)
      }
      return next
    })
  }

  const confirmarPedidosYa = (config = pedidosYaConfig) => {
    const medios = config.medios || []
    if (!medios.length) {
      setError('En Pedidos Ya elegí efectivo, transferencia o ambos.')
      setShowPedidosYaModal(true)
      return
    }

    if (medios.length >= 2) {
      const resolucion = config.pagosResueltos
        ? { ok: true, entries: config.pagosResueltos }
        : resolverPagosCombinados(medios, config.montos, total)
      if (!resolucion.ok) {
        setError(resolucion.error || 'Revisá los importes de Pedidos Ya.')
        setShowPedidosYaModal(true)
        return
      }
      onConfirm({
        pagoCombinado: true,
        metodoPago: '',
        montosPago: { ...montosVacios(), ...config.montos },
        montoRecibidoEfectivo: '',
        metodosSeleccionados: medios,
        pagosResueltos: resolucion.entries,
        canalPago: 'pedidos_ya'
      })
      return
    }

    const unicoPy = medios[0]
    if (unicoPy === 'efectivo' && !esDevolucionEnvase) {
      const recibido = parseMontoPago(config.montoRecibidoEfectivo)
      if (Number.isNaN(recibido) || String(config.montoRecibidoEfectivo).trim() === '' || recibido + 1e-9 < total) {
        setError('Indicá con cuánto paga en efectivo (debe cubrir el total).')
        setShowPedidosYaModal(true)
        return
      }
    }

    onConfirm({
      pagoCombinado: false,
      metodoPago: unicoPy,
      montosPago: montosVacios(),
      montoRecibidoEfectivo: unicoPy === 'efectivo' ? config.montoRecibidoEfectivo : '',
      metodosSeleccionados: medios,
      canalPago: 'pedidos_ya'
    })
  }

  const intentarConfirmar = () => {
    if (metodoUnico === 'pedidos_ya' && !pedidosYaListo) {
      setShowPedidosYaModal(true)
      return
    }
    if (metodosNecesitanDetalle(metodosSeleccionados, esDevolucionEnvase) && confirmarDeshabilitado) {
      setShowDetallePago(true)
      return
    }
    confirmar()
  }

  const confirmar = () => {
    setError('')
    if (metodosSeleccionados.length === 0) {
      setError('Seleccioná al menos un método de pago.')
      return
    }

    if (metodoUnico === 'pedidos_ya') {
      confirmarPedidosYa()
      return
    }

    if (pagoCombinado) {
      const resolucion = resolverPagosCombinados(
        metodosSeleccionados,
        montosPago,
        total
      )
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
        pagoCombinado: true,
        metodoPago: '',
        montosPago,
        montoRecibidoEfectivo: '',
        metodosSeleccionados,
        pagosResueltos: resolucion.entries
      })
      return
    }

    if (!efectivoOk) {
      setError('Indicá con cuánto paga (debe cubrir el total).')
      return
    }

    const dueno = String(nombreDueno || '').trim()
    if (metodoUnico === 'retiro' && !dueno) {
      setError('Indicá el nombre del dueño.')
      return
    }

    onConfirm({
      pagoCombinado: false,
      metodoPago: metodoUnico,
      montosPago: montosVacios(),
      montoRecibidoEfectivo: metodoUnico === 'efectivo' ? montoRecibidoEfectivo : '',
      metodosSeleccionados,
      nombreDueno: metodoUnico === 'retiro' ? dueno : ''
    })
  }

  if (!open) return null

  return (
    <>
    <div
      className="fixed inset-0 z-[95] flex justify-center sm:items-center bg-black/50 sm:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white dark:bg-slate-900 w-full max-w-3xl h-dvh max-h-dvh overflow-hidden flex flex-col shadow-2xl sm:h-auto sm:max-h-[92dvh] sm:rounded-2xl sm:my-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobrar-venta-titulo"
      >
        <div className="shrink-0 px-4 sm:px-8 py-4 sm:py-5 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between gap-3">
          <h3 id="cobrar-venta-titulo" className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-slate-50">
            {metodoUnico === 'retiro' ? 'Retiro de mercadería' : 'Cobrar venta'}
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

        <div className="shrink-0 px-4 sm:px-8 py-4 sm:py-5 text-center border-b border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-900">
          <p className="text-sm font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
            {metodoUnico === 'retiro' ? 'Valor estimado' : 'Total a pagar'}
          </p>
          <p
            className={`text-4xl sm:text-5xl font-extrabold tabular-nums mt-1 ${
              total < 0 ? 'text-red-600 dark:text-red-300' : 'text-emerald-700 dark:text-emerald-300'
            }`}
          >
            {fmtMoney(total)}
          </p>
        </div>

        <div className="px-4 sm:px-8 py-5 sm:py-6 space-y-6 overflow-y-auto flex-1 min-h-0">
          {esDevolucionEnvase && (
            <p className="text-xs text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-700 rounded-lg px-3 py-2">
              Devolución de envase: elegí un solo método para devolver el dinero.
            </p>
          )}

          <div>
            <p className="text-sm font-semibold text-gray-600 dark:text-slate-300 mb-3">
              Métodos de pago
              {!esDevolucionEnvase && (
                <span className="font-normal text-gray-500 dark:text-slate-400">
                  {' '}
                  · podés combinar efectivo, transferencia, tarjeta o fiado. Pedidos Ya y retiro van solos.
                </span>
              )}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
              {metodosDisponibles.map(({ key, label, Icon }) => {
                const activo = metodosSeleccionados.includes(key)
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleMetodo(key)}
                    className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 px-4 py-6 sm:py-8 transition-colors ${
                      activo
                        ? key === 'retiro'
                          ? 'border-amber-500 bg-amber-50 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100 dark:border-amber-400'
                          : key === 'pedidos_ya'
                            ? 'border-rose-500 bg-rose-50 text-rose-950 dark:bg-rose-950/50 dark:text-rose-100 dark:border-rose-400'
                            : 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-100 dark:border-emerald-400'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-emerald-300 hover:bg-emerald-50/50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-emerald-600'
                    }`}
                  >
                    <Icon
                      size={34}
                      className={
                        activo
                          ? key === 'retiro'
                            ? 'text-amber-600 dark:text-amber-300'
                            : key === 'pedidos_ya'
                              ? 'text-rose-600 dark:text-rose-300'
                              : 'text-emerald-600 dark:text-emerald-300'
                          : ''
                      }
                    />
                    <span className="text-sm sm:text-base font-bold uppercase tracking-wide">{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {metodosNecesitanDetalle(metodosSeleccionados, esDevolucionEnvase) && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <p className="text-sm text-emerald-950 dark:text-emerald-100 flex-1">
                {pagoCombinado
                  ? 'Completá los importes y, si hay fiado, el nombre de la persona.'
                  : metodoUnico === 'fiado'
                    ? 'Indicá el nombre de la persona que se fía.'
                    : metodoUnico === 'retiro'
                      ? 'Indicá el nombre del dueño.'
                      : 'Indicá con cuánto paga en efectivo.'}
              </p>
              <button
                type="button"
                onClick={() => setShowDetallePago(true)}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold shrink-0"
              >
                Cargar datos
              </button>
            </div>
          )}

          {metodoUnico === 'pedidos_ya' && (
            <div className="space-y-3 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 sm:p-5">
              {pedidosYaListo ? (
                <>
                  <p className="text-sm text-rose-950 dark:text-rose-100">
                    Pedidos Ya se cobra como{' '}
                    <strong>
                      {pedidosYaConfig.medios
                        .map((k) => (k === 'efectivo' ? 'efectivo' : 'transferencia'))
                        .join(' + ')}
                    </strong>
                    . El efectivo entra a caja; la transferencia no.
                  </p>
                  {pedidosYaConfig.medios.length >= 2 && pedidosYaConfig.pagosResueltos?.length > 0 && (
                    <ul className="text-sm tabular-nums text-rose-900 dark:text-rose-100 space-y-1">
                      {pedidosYaConfig.pagosResueltos.map((p) => (
                        <li key={p.metodo}>
                          {p.metodo === 'efectivo' ? 'Efectivo' : 'Transferencia'}: {fmtMoney(p.monto)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {pedidosYaConfig.medios.length === 1 && pedidosYaConfig.medios[0] === 'efectivo' &&
                    pedidosYaConfig.montoRecibidoEfectivo && (
                      <p className="text-sm tabular-nums text-rose-900 dark:text-rose-100">
                        Recibido {fmtMoney(parseMontoPago(pedidosYaConfig.montoRecibidoEfectivo))} · entra a
                        caja {fmtMoney(total)}
                      </p>
                    )}
                </>
              ) : (
                <p className="text-sm text-rose-950 dark:text-rose-100">
                  Elegí si Pedidos Ya te pagó en efectivo, transferencia o ambos.
                </p>
              )}
              <button
                type="button"
                onClick={() => setShowPedidosYaModal(true)}
                className="w-full sm:w-auto px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-semibold"
              >
                {pedidosYaListo ? 'Cambiar medios Pedidos Ya' : 'Elegir efectivo o transferencia'}
              </button>
            </div>
          )}

          {error && !showDetallePago && (
            <p className="text-sm text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-800 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        <div className="shrink-0 px-4 sm:px-8 py-4 sm:py-5 border-t border-gray-100 dark:border-slate-700 flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-3.5 sm:py-4 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 font-medium text-base"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={intentarConfirmar}
            disabled={submitting || metodosSeleccionados.length === 0}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-3.5 sm:py-4 rounded-xl text-white font-semibold text-base disabled:opacity-50 ${
              metodoUnico === 'retiro'
                ? 'bg-amber-600 hover:bg-amber-700'
                : metodoUnico === 'pedidos_ya'
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-emerald-600 hover:bg-emerald-700'
            }`}
          >
            <CheckCircle size={20} />
            {submitting ? 'Registrando…' : metodoUnico === 'retiro' ? 'Confirmar retiro' : 'Confirmar cobro'}
          </button>
        </div>
      </div>
    </div>

    <DetallePagoModal
      open={showDetallePago}
      total={total}
      esDevolucionEnvase={esDevolucionEnvase}
      submitting={submitting}
      metodosSeleccionados={metodosSeleccionados}
      metodoUnico={metodoUnico}
      pagoCombinado={pagoCombinado}
      montosPago={montosPago}
      setMontosPago={setMontosPago}
      montoRecibidoEfectivo={montoRecibidoEfectivo}
      setMontoRecibidoEfectivo={setMontoRecibidoEfectivo}
      nombreDueno={nombreDueno}
      setNombreDueno={setNombreDueno}
      montoRecibidoNum={montoRecibidoNum}
      vueltoEfectivo={vueltoEfectivo}
      indicadorCombinado={indicadorCombinado}
      montoFiadoCombinado={montoFiadoCombinado}
      renderCampoFiado={renderCampoFiado}
      error={error}
      confirmarDeshabilitado={confirmarDeshabilitado}
      onClose={() => {
        if (submitting) return
        setShowDetallePago(false)
      }}
      onConfirm={confirmar}
    />

    <PedidosYaPagoModal
      open={showPedidosYaModal}
      total={total}
      esDevolucionEnvase={esDevolucionEnvase}
      submitting={submitting}
      initialMedios={pedidosYaConfig.medios}
      initialMontos={pedidosYaConfig.montos}
      initialRecibido={pedidosYaConfig.montoRecibidoEfectivo}
      onClose={() => {
        if (submitting) return
        setShowPedidosYaModal(false)
        setPedidosYaConfig(pedidosYaVacio())
        setMetodosSeleccionados((prev) => prev.filter((k) => k !== 'pedidos_ya'))
      }}
      onConfirm={(config) => {
        const next = {
          medios: config.medios,
          montos: config.montos,
          montoRecibidoEfectivo: config.montoRecibidoEfectivo,
          pagosResueltos: config.pagosResueltos
        }
        setPedidosYaConfig(next)
        setError('')
        if (next.medios.includes('transferencia')) {
          setShowPedidosYaModal(false)
        }
        confirmarPedidosYa(next)
      }}
    />
    </>
  )
}
