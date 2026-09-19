import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { retirosAPI } from '../services/api'
import { hoyLocalISO } from '../utils/fechas'

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const parseMonto = (v) => {
  const s = String(v ?? '')
    .trim()
    .replace(',', '.')
  if (!s) return 0
  const n = parseFloat(s)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN
}

const fmtFechaHora = (fecha) => {
  if (!fecha) return '—'
  const d = new Date(fecha)
  if (Number.isNaN(d.getTime())) return String(fecha)
  return d.toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const Retiros = () => {
  const [mensaje, setMensaje] = useState(null)
  const [historial, setHistorial] = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [monto, setMonto] = useState('')
  const [motivoEf, setMotivoEf] = useState('')
  const [guardandoEf, setGuardandoEf] = useState(false)
  const [confirmacion, setConfirmacion] = useState(null)

  const loadHistorial = useCallback(async () => {
    setLoadingHist(true)
    try {
      const { data } = await retirosAPI.listar({ tipo: 'efectivo', limit: 40 })
      setHistorial(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoadingHist(false)
    }
  }, [])

  useEffect(() => {
    loadHistorial()
  }, [loadHistorial])

  const pedirConfirmacion = (e) => {
    e.preventDefault()
    const m = parseMonto(monto)
    if (!Number.isFinite(m) || m <= 0) {
      setMensaje({ tipo: 'aviso', texto: 'Ingrese un monto válido mayor a 0.' })
      return
    }
    setMensaje(null)
    setConfirmacion({ monto: m, motivo: motivoEf.trim() })
  }

  const cancelarConfirmacion = () => {
    if (guardandoEf) return
    setConfirmacion(null)
  }

  const registrarEfectivo = async () => {
    const m = Number(confirmacion?.monto)
    if (!Number.isFinite(m) || m <= 0) {
      setConfirmacion(null)
      setMensaje({ tipo: 'aviso', texto: 'Ingrese un monto válido mayor a 0.' })
      return
    }
    setGuardandoEf(true)
    setMensaje(null)
    try {
      await retirosAPI.efectivo({
        monto: m,
        metodo_pago: 'efectivo',
        motivo: confirmacion.motivo || undefined
      })
      setMensaje({
        tipo: 'ok',
        texto: `Retiro de ${fmtMoney(m)} registrado. Se resta en el arqueo/cierre del turno.`
      })
      setMonto('')
      setMotivoEf('')
      setConfirmacion(null)
      await loadHistorial()
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.response?.data?.error || 'No se pudo registrar el retiro de efectivo.'
      })
    } finally {
      setGuardandoEf(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Retiro efectivo</h1>
        <p className="text-sm text-gray-600 mt-1">
          Asentá retiros de efectivo del dueño. Se resta en el arqueo y cierre del turno. El retiro de
          mercadería se hace desde Ventas, cobrando con RETIRO.
        </p>
      </header>

      {mensaje && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex gap-2 items-start ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : mensaje.tipo === 'aviso'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          {mensaje.tipo === 'ok' ? (
            <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
          ) : (
            <AlertCircle size={18} className="shrink-0 mt-0.5" />
          )}
          <span>{mensaje.texto}</span>
        </div>
      )}

      <form
        onSubmit={pedirConfirmacion}
        className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Monto</label>
          <input
            type="text"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0,00"
            className="w-full max-w-xs px-3 py-2.5 border border-gray-300 rounded-xl text-lg font-semibold tabular-nums focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Dueño</label>
          <input
            type="text"
            value={motivoEf}
            onChange={(e) => setMotivoEf(e.target.value)}
            placeholder="Nombre del dueño"
            className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={guardandoEf}
          className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 disabled:opacity-50"
        >
          {guardandoEf ? 'Guardando…' : 'Registrar retiro de efectivo'}
        </button>
      </form>

      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Últimos retiros de efectivo</h2>
          <span className="text-xs text-gray-500">{hoyLocalISO()}</span>
        </div>
        {loadingHist ? (
          <p className="p-6 text-center text-sm text-gray-500">Cargando…</p>
        ) : historial.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">Sin retiros registrados todavía.</p>
        ) : (
          <ul className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {historial.map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm flex flex-wrap justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-gray-900 font-medium">{fmtMoney(r.monto)}</p>
                  <p className="text-xs text-gray-500">
                    {fmtFechaHora(r.fecha)} · {r.registrado_por || '—'}
                    {r.motivo ? ` · ${r.motivo}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        </section>

      {confirmacion && (
        <div
          className="fixed inset-0 z-[95] flex justify-center sm:items-center bg-black/50 sm:p-4"
          onClick={cancelarConfirmacion}
          role="presentation"
        >
          <div
            className="bg-white dark:bg-slate-900 w-full max-w-md h-auto max-h-[92dvh] overflow-hidden flex flex-col shadow-2xl sm:rounded-2xl my-auto"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirmar-retiro-titulo"
          >
            <div className="shrink-0 px-5 py-4 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between gap-3">
              <h3
                id="confirmar-retiro-titulo"
                className="text-lg font-semibold text-gray-900 dark:text-slate-50"
              >
                Confirmar retiro
              </h3>
              <button
                type="button"
                onClick={cancelarConfirmacion}
                disabled={guardandoEf}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-800"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-3">
              <p className="text-sm text-gray-600 dark:text-slate-300">
                Revisá el monto antes de confirmar. Un cero de más no se puede deshacer fácil.
              </p>
              <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400 text-center">
                Vas a retirar
              </p>
              <p className="text-4xl sm:text-5xl font-extrabold tabular-nums text-center text-amber-700 dark:text-amber-300">
                {fmtMoney(confirmacion.monto)}
              </p>
              {confirmacion.motivo ? (
                <p className="text-sm text-center text-gray-600 dark:text-slate-300">
                  Dueño: <strong>{confirmacion.motivo}</strong>
                </p>
              ) : null}
              <p className="text-xs text-center text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                Este importe se resta del efectivo de caja del turno.
              </p>
            </div>
            <div className="shrink-0 px-5 py-4 border-t border-gray-100 dark:border-slate-700 flex flex-col-reverse sm:flex-row gap-3">
              <button
                type="button"
                onClick={cancelarConfirmacion}
                disabled={guardandoEf}
                className="flex-1 px-4 py-3 rounded-xl bg-gray-100 dark:bg-slate-800 text-gray-700 dark:text-slate-200 font-medium"
              >
                Volver a corregir
              </button>
              <button
                type="button"
                onClick={registrarEfectivo}
                disabled={guardandoEf}
                className="flex-1 px-4 py-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold disabled:opacity-50"
              >
                {guardandoEf ? 'Guardando…' : 'Sí, retirar este monto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Retiros
