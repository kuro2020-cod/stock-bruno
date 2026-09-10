import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Landmark, AlertCircle, CheckCircle2, Calendar } from 'lucide-react'
import { mercadopagoAPI } from '../services/api'
import { hoyLocalISO } from '../utils/fechas'

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const fmtFechaHora = (fecha) => {
  if (!fecha) return '—'
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return String(fecha)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

const claseEstado = (estado) => {
  if (estado === 'approved') return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  if (estado === 'pending' || estado === 'in_process') return 'bg-amber-50 text-amber-900 border-amber-200'
  if (estado === 'rejected' || estado === 'cancelled') return 'bg-red-50 text-red-800 border-red-200'
  return 'bg-slate-50 text-slate-700 border-slate-200'
}

const MercadoPago = () => {
  const [fecha, setFecha] = useState(() => hoyLocalISO())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [configurado, setConfigurado] = useState(null)
  const [cuenta, setCuenta] = useState(null)
  const [qrCobro, setQrCobro] = useState(null)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data: res } = await mercadopagoAPI.movimientos({ fecha, status: 'approved' })
      setData(res)
      setConfigurado(true)
    } catch (e) {
      const msg = e.response?.data?.error || 'No se pudieron cargar los movimientos de Mercado Pago'
      setError(msg)
      setData(null)
      if (e.response?.status === 503 || e.response?.data?.configurado === false) {
        setConfigurado(false)
      }
    } finally {
      setLoading(false)
    }
  }, [fecha])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data: est } = await mercadopagoAPI.estado()
        if (!cancelled) {
          setConfigurado(Boolean(est?.configurado))
          setCuenta(est?.cuenta || null)
          setQrCobro({
            listo: Boolean(est?.qr_cobro_configurado),
            posId: est?.external_pos_id || null,
            mensaje: est?.mensaje || null
          })
        }
      } catch {
        if (!cancelled) {
          setConfigurado(null)
          setCuenta(null)
          setQrCobro(null)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const movimientos = data?.movimientos || []

  return (
    <div className="max-w-5xl">
      <header className="page-header mb-6">
        <h2 className="page-title mb-1 flex items-center gap-2">
          <Landmark className="text-sky-700" size={28} />
          Mercado Pago
        </h2>
      </header>

      {configurado === false && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 flex gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Falta configurar el Access Token</p>
            <p className="mt-1 text-xs leading-relaxed">
              En{' '}
              <a
                href="https://www.mercadopago.com.ar/developers/panel/app"
                target="_blank"
                rel="noreferrer"
                className="underline font-medium"
              >
                developers.mercadopago.com
              </a>
              , abrí tu aplicación → Credenciales de producción → copiá el{' '}
              <strong>Access Token</strong>. Pegalo en <code className="bg-amber-100 px-1 rounded">backend/.env</code>{' '}
              como <code className="bg-amber-100 px-1 rounded">MERCADOPAGO_ACCESS_TOKEN=APP_USR-...</code> y reiniciá
              el backend.
            </p>
          </div>
        </div>
      )}

      {configurado && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm flex gap-2 ${
            qrCobro?.listo
              ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
              : 'border-sky-200 bg-sky-50 text-sky-950'
          }`}
        >
          {qrCobro?.listo ? (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
          )}
          <div className="text-xs leading-relaxed space-y-1">
            <p className="font-semibold text-sm">
              {qrCobro?.listo
                ? 'Cobro con QR fijo activo'
                : 'Cobro con QR fijo (monto automático)'}
            </p>
            {qrCobro?.listo ? (
              <p>
                POS configurado: <code className="bg-white/70 px-1 rounded">{qrCobro.posId}</code>. En
                Ventas, al elegir transferencia se envía el total al QR del mostrador.
              </p>
            ) : (
              <>
                <p>
                  Configurá en <code className="bg-white/70 px-1 rounded">backend/.env</code> la variable{' '}
                  <code className="bg-white/70 px-1 rounded">MERCADOPAGO_EXTERNAL_POS_ID</code> con el{' '}
                  <strong>external_id</strong> de la caja (POS) creada en Mercado Pago (la del QR fijo).
                </p>
                <p>
                  Guía:{' '}
                  <a
                    href="https://www.mercadopago.com.ar/developers/es/docs/qr-code/create-store-and-pos"
                    target="_blank"
                    rel="noreferrer"
                    className="underline font-medium"
                  >
                    Crear sucursal y caja
                  </a>
                  . Reiniciá el backend después de guardar.
                </p>
              </>
            )}
          </div>
        </div>
      )}
      {cuenta?.es_prueba && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950 flex gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Estás usando un token de PRUEBA</p>
            <p className="mt-1 text-xs leading-relaxed">
              La API está conectada a una cuenta de prueba. Usá el Access Token de{' '}
              <strong>producción</strong> de tu cuenta real en{' '}
              <code className="bg-red-100 px-1 rounded">backend/.env</code> y reiniciá el backend.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-5 flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
        <div>
          <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
            <Calendar size={14} />
            Fecha
          </label>
          <input
            type="date"
            value={fecha}
            max={hoyLocalISO()}
            onChange={(e) => setFecha(e.target.value)}
            className="mt-1 px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <button
          type="button"
          onClick={cargar}
          disabled={loading}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 text-white text-sm font-semibold hover:bg-sky-700 disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex gap-2">
          <AlertCircle size={18} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 py-8 text-center">Consultando transferencias recibidas…</p>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
              <p className="text-xs text-sky-800 uppercase font-semibold">Recibidas</p>
              <p className="text-2xl font-bold text-sky-950 tabular-nums mt-1">{data.cantidad || 0}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 sm:col-span-2">
              <p className="text-xs text-emerald-800 uppercase font-semibold">Total recibido del día</p>
              <p className="text-2xl font-bold text-emerald-900 tabular-nums mt-1">
                {fmtMoney(data.total_monto)}
              </p>
            </div>
          </div>

          {movimientos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-500 text-sm">
              No hay transferencias recibidas para {fecha}.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-3 font-semibold">Hora</th>
                      <th className="px-4 py-3 font-semibold">De</th>
                      <th className="px-4 py-3 font-semibold">Estado</th>
                      <th className="px-4 py-3 font-semibold text-right">Monto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m) => (
                      <tr key={m.id} className="border-t border-gray-100 hover:bg-slate-50/80">
                        <td className="px-4 py-3 whitespace-nowrap text-gray-700 tabular-nums">
                          {fmtFechaHora(m.fecha)}
                        </td>
                        <td className="px-4 py-3 max-w-[18rem]">
                          <p
                            className="font-medium text-gray-900 truncate"
                            title={
                              m.pagador_nombre && m.pagador_email
                                ? `${m.pagador_nombre} · ${m.pagador_email}`
                                : m.pagador || ''
                            }
                          >
                            {m.pagador_nombre || m.pagador_email || m.pagador || 'Transferencia recibida'}
                          </p>
                          {m.pagador_nombre && m.pagador_email ? (
                            <p className="text-[11px] text-gray-500 truncate">{m.pagador_email}</p>
                          ) : (
                            <p className="text-[11px] text-gray-500">Transferencia recibida</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold ${claseEstado(m.estado)}`}
                          >
                            {m.estado === 'approved' ? <CheckCircle2 size={12} /> : null}
                            {m.estado_label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold tabular-nums text-emerald-800">
                          + {fmtMoney(m.monto)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}

export default MercadoPago
