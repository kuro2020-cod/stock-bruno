import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, Landmark, X, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'
import { mercadopagoAPI } from '../services/api'
import { hoyLocalISO } from '../utils/fechas'

const PAGE_SIZE = 3

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtHora = (fecha) => {
  if (!fecha) return '—'
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return String(fecha)
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/**
 * Modal para verificar transferencias recibidas en MP sin salir de Ventas.
 */
export default function VerificarTransferenciaMpModal({
  montoEsperado,
  onConfirm,
  onCancel,
  confirming = false
}) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [pagina, setPagina] = useState(0)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: res } = await mercadopagoAPI.movimientos({
        fecha: hoyLocalISO(),
        status: 'approved'
      })
      setData(res)
      setPagina(0)
    } catch (e) {
      setData(null)
      setError(
        e.response?.data?.error ||
          'No se pudieron consultar las transferencias de Mercado Pago'
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const movimientos = data?.movimientos || []
  const totalPaginas = Math.max(1, Math.ceil(movimientos.length / PAGE_SIZE))
  const paginaSafe = Math.min(pagina, totalPaginas - 1)

  const paginaItems = useMemo(() => {
    const start = paginaSafe * PAGE_SIZE
    return movimientos.slice(start, start + PAGE_SIZE)
  }, [movimientos, paginaSafe])

  const esperado = Number(montoEsperado || 0)
  const coincide = movimientos.some(
    (m) => Math.abs(Number(m.monto || 0) - esperado) <= 0.05
  )

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center p-4 bg-black/45"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="verificar-mp-titulo"
      >
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 bg-gradient-to-r from-sky-600 to-sky-700 text-white shrink-0">
          <div className="min-w-0">
            <h3 id="verificar-mp-titulo" className="text-lg font-semibold flex items-center gap-2">
              <Landmark size={20} />
              Verificar transferencia
            </h3>
            <p className="text-sm text-sky-50/95 mt-0.5">
              Transferencias recibidas hoy · Esperado:{' '}
              <strong className="tabular-nums">{fmtMoney(esperado)}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="p-2 rounded-lg text-white/80 hover:bg-white/15 disabled:opacity-50"
            aria-label="Cerrar"
          >
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto flex-1 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-gray-500">
              {coincide ? (
                <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                  <CheckCircle2 size={14} />
                  Hay al menos una transferencia por el monto esperado
                </span>
              ) : (
                'Revisá si ya llegó el pago antes de confirmar la venta'
              )}
            </p>
            <button
              type="button"
              onClick={cargar}
              disabled={loading || confirming}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-sky-300 text-sky-800 hover:bg-sky-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              Actualizar
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 flex gap-2">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>
                {error}
                <span className="block text-xs mt-1 text-amber-800/90">
                  Podés confirmar la venta igual si ya verificaste el pago por otro medio.
                </span>
              </span>
            </div>
          )}

          {loading && !data ? (
            <p className="text-sm text-gray-500 py-6 text-center">Consultando Mercado Pago…</p>
          ) : !error && movimientos.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-600">
              Todavía no hay transferencias recibidas hoy.
              <p className="text-xs text-gray-500 mt-1">Tocá Actualizar cuando el cliente haya enviado.</p>
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                {paginaItems.map((m) => {
                  const match = Math.abs(Number(m.monto || 0) - esperado) <= 0.05
                  return (
                    <li
                      key={m.id}
                      className={`rounded-xl border px-3 py-2.5 flex items-center gap-3 ${
                        match
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-gray-200 bg-white'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-500 tabular-nums">{fmtHora(m.fecha)}</p>
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {m.pagador_nombre || m.pagador_email || m.pagador || 'Transferencia recibida'}
                        </p>
                        {m.pagador_nombre && m.pagador_email ? (
                          <p className="text-[11px] text-gray-500 truncate">{m.pagador_email}</p>
                        ) : null}
                      </div>
                      <p
                        className={`text-sm font-bold tabular-nums shrink-0 ${
                          match ? 'text-emerald-800' : 'text-emerald-700'
                        }`}
                      >
                        + {fmtMoney(m.monto)}
                      </p>
                    </li>
                  )
                })}
              </ul>

              {movimientos.length > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    disabled={paginaSafe <= 0 || confirming}
                    onClick={() => setPagina((p) => Math.max(0, p - 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                    Anterior
                  </button>
                  <p className="text-xs text-gray-500 tabular-nums">
                    {paginaSafe + 1} / {totalPaginas}
                  </p>
                  <button
                    type="button"
                    disabled={paginaSafe >= totalPaginas - 1 || confirming}
                    onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    Siguiente
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </>
          )}

          {data && !error && (
            <p className="text-xs text-gray-500 text-right">
              {data.cantidad || 0} recibida(s) · Total día {fmtMoney(data.total_monto)}
            </p>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 flex flex-wrap gap-3 shrink-0 bg-gray-50">
          <button
            type="button"
            onClick={onConfirm}
            disabled={confirming}
            className="w-full px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            {confirming ? 'Registrando venta…' : 'Aceptar'}
          </button>
        </div>
      </div>
    </div>
  )
}
