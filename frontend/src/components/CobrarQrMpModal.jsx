import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, QrCode, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import { mercadopagoAPI } from '../services/api'

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const POLL_MS = 2500

/**
 * Envía el monto al QR fijo de Mercado Pago (orden mode=static) y espera el pago.
 */
export default function CobrarQrMpModal({
  montoEsperado,
  onConfirm,
  onCancel,
  confirming = false
}) {
  const [creando, setCreando] = useState(true)
  const [error, setError] = useState(null)
  const [orden, setOrden] = useState(null)
  const [consultando, setConsultando] = useState(false)
  const pollRef = useRef(null)
  const confirmedRef = useRef(false)
  const orderIdRef = useRef(null)

  const detenerPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const consultar = useCallback(async (orderId) => {
    if (!orderId || confirmedRef.current) return
    setConsultando(true)
    try {
      const { data } = await mercadopagoAPI.consultarOrdenQr(orderId)
      const o = data?.orden
      if (!o) return
      setOrden(o)
      if (o.pagado && !confirmedRef.current) {
        confirmedRef.current = true
        detenerPoll()
        onConfirm?.()
      } else if (o.cancelada || o.expirada) {
        detenerPoll()
        setError(
          o.expirada
            ? 'La orden venció. Cancelá e intentá de nuevo.'
            : 'La orden fue cancelada.'
        )
      }
    } catch (e) {
      // No cortar el poll por un error puntual de red
      console.error(e)
    } finally {
      setConsultando(false)
    }
  }, [detenerPoll, onConfirm])

  const iniciarPoll = useCallback(
    (orderId) => {
      detenerPoll()
      pollRef.current = setInterval(() => {
        consultar(orderId)
      }, POLL_MS)
    },
    [consultar, detenerPoll]
  )

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setCreando(true)
      setError(null)
      setOrden(null)
      confirmedRef.current = false
      try {
        const { data } = await mercadopagoAPI.crearOrdenQr({
          monto: Number(montoEsperado),
          descripcion: 'Venta mostrador'
        })
        if (cancelled) {
          if (data?.orden?.id) {
            try {
              await mercadopagoAPI.cancelarOrdenQr(data.orden.id)
            } catch {
              /* ignore */
            }
          }
          return
        }
        setOrden(data.orden)
        orderIdRef.current = data.orden?.id || null
        if (data.orden?.id) iniciarPoll(data.orden.id)
      } catch (e) {
        if (!cancelled) {
          setError(
            e.response?.data?.error ||
              'No se pudo enviar el monto al QR de Mercado Pago. Revisá el POS (MERCADOPAGO_EXTERNAL_POS_ID).'
          )
        }
      } finally {
        if (!cancelled) setCreando(false)
      }
    })()

    return () => {
      cancelled = true
      detenerPoll()
    }
  }, [montoEsperado, iniciarPoll, detenerPoll])

  const handleCancel = async () => {
    if (confirming) return
    detenerPoll()
    const id = orderIdRef.current || orden?.id
    if (id && orden?.pendiente) {
      try {
        await mercadopagoAPI.cancelarOrdenQr(id)
      } catch {
        /* ignore */
      }
    }
    onCancel?.()
  }

  const esperado = Number(montoEsperado || 0)
  const pagado = Boolean(orden?.pagado)

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/45"
      onClick={handleCancel}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cobrar-qr-mp-titulo"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gradient-to-r from-sky-600 to-sky-700 text-white shrink-0">
          <div className="min-w-0">
            <h3 id="cobrar-qr-mp-titulo" className="text-lg font-semibold flex items-center gap-2">
              <QrCode size={20} />
              Cobrar con QR Mercado Pago
            </h3>
            <p className="text-sm text-sky-50/95 mt-0.5">
              Monto enviado al QR fijo:{' '}
              <strong className="tabular-nums">{fmtMoney(esperado)}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={confirming}
            className="p-2 rounded-lg text-white/80 hover:bg-white/15 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-5 overflow-y-auto flex-1 space-y-4">
          {creando && (
            <div className="flex flex-col items-center gap-3 py-8 text-gray-600">
              <Loader2 className="animate-spin text-sky-600" size={32} />
              <p className="text-sm">Enviando monto al QR…</p>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 flex gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!creando && orden && !error && (
            <>
              {pagado ? (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-6 text-center">
                  <CheckCircle2 className="mx-auto text-emerald-600 mb-2" size={36} />
                  <p className="font-semibold text-emerald-900">Pago recibido</p>
                  <p className="text-sm text-emerald-800 mt-1">Registrando la venta…</p>
                </div>
              ) : (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-6 text-center space-y-2">
                  <QrCode className="mx-auto text-sky-700" size={48} />
                  <p className="font-semibold text-sky-950 text-lg tabular-nums">
                    {fmtMoney(orden.total_amount || esperado)}
                  </p>
                  <p className="text-sm text-sky-900">
                    Pedile al cliente que escanee el <strong>QR fijo</strong> del negocio.
                  </p>
                  <p className="text-xs text-sky-800/90">
                    El monto ya está cargado en Mercado Pago. Esperando el pago…
                  </p>
                  <div className="flex items-center justify-center gap-2 pt-2 text-xs text-sky-700">
                    <RefreshCw size={14} className={consultando ? 'animate-spin' : ''} />
                    Consultando estado automáticamente
                  </div>
                </div>
              )}

              <div className="text-xs text-gray-500 space-y-1">
                <p>
                  Estado:{' '}
                  <span className="font-medium text-gray-700">{orden.status || '—'}</span>
                  {orden.status_detail ? ` · ${orden.status_detail}` : ''}
                </p>
                {orden.id && (
                  <p className="font-mono truncate" title={orden.id}>
                    Orden: {orden.id}
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-3 shrink-0 bg-gray-50">
          {!pagado && orden?.pendiente && (
            <button
              type="button"
              onClick={() => consultar(orden.id)}
              disabled={confirming || creando || consultando}
              className="flex-1 px-4 py-2.5 rounded-xl border border-sky-300 text-sky-900 font-semibold text-sm hover:bg-sky-50 disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              <RefreshCw size={16} className={consultando ? 'animate-spin' : ''} />
              Actualizar
            </button>
          )}
          {pagado && (
            <button
              type="button"
              onClick={() => onConfirm?.()}
              disabled={confirming}
              className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {confirming ? 'Registrando venta…' : 'Confirmar venta'}
            </button>
          )}
          {!pagado && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={confirming}
              className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-100 disabled:opacity-50"
            >
              Cancelar cobro
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
