import { useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, CheckCircle2, AlertCircle } from 'lucide-react'
import { ingresosEfectivoAPI } from '../services/api'

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

const IngresosEfectivo = () => {
  const [mensaje, setMensaje] = useState(null)
  const [historial, setHistorial] = useState([])
  const [loadingHist, setLoadingHist] = useState(false)
  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const loadHistorial = useCallback(async () => {
    setLoadingHist(true)
    try {
      const { data } = await ingresosEfectivoAPI.listar({ limit: 40 })
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

  const registrar = async (e) => {
    e.preventDefault()
    const m = parseMonto(monto)
    if (!Number.isFinite(m) || m <= 0) {
      setMensaje({ tipo: 'aviso', texto: 'Ingresá un monto válido mayor a 0.' })
      return
    }
    setGuardando(true)
    setMensaje(null)
    try {
      await ingresosEfectivoAPI.registrar({
        monto: m,
        motivo: motivo.trim() || null
      })
      setMensaje({ tipo: 'ok', texto: `Ingreso de ${fmtMoney(m)} registrado. Se suma al efectivo de caja.` })
      setMonto('')
      setMotivo('')
      await loadHistorial()
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.response?.data?.error || 'No se pudo registrar el ingreso.'
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-50">Ingreso de efectivo</h1>
        <p className="text-sm text-gray-600 dark:text-slate-400 mt-1">
          Registrá dinero que entra a la caja (cambio, reposición, etc.). Suma al efectivo del turno y aparece en el
          arqueo y cierre de caja.
        </p>
      </header>

      {mensaje && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm flex gap-2 items-start ${
            mensaje.tipo === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-100'
              : mensaje.tipo === 'aviso'
                ? 'bg-amber-50 border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-100'
                : 'bg-red-50 border-red-200 text-red-900 dark:bg-red-950/40 dark:border-red-800 dark:text-red-100'
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
        onSubmit={registrar}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 p-5 shadow-sm space-y-4"
      >
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">Monto</label>
          <input
            type="text"
            inputMode="decimal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0,00"
            className="w-full max-w-xs px-3 py-2.5 border border-gray-300 dark:border-slate-600 rounded-xl text-lg font-semibold tabular-nums bg-white dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
            autoFocus
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
            Motivo / concepto (opcional)
          </label>
          <input
            type="text"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej. cambio, reposición de caja"
            className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-xl text-sm bg-white dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <button
          type="submit"
          disabled={guardando}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 disabled:opacity-50"
        >
          <ArrowDownToLine size={18} />
          {guardando ? 'Guardando…' : 'Registrar ingreso de efectivo'}
        </button>
      </form>

      <section className="bg-white dark:bg-slate-900 rounded-2xl border border-gray-200 dark:border-slate-700 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 dark:border-slate-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-slate-100">Últimos ingresos</h2>
          {loadingHist && <span className="text-xs text-gray-500">Cargando…</span>}
        </div>
        {historial.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500 dark:text-slate-400">
            Sin ingresos registrados todavía.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-slate-800">
            {historial.map((row) => (
              <li
                key={row.id}
                className="px-4 py-3 flex flex-wrap justify-between gap-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-sky-700 dark:text-sky-300 tabular-nums">{fmtMoney(row.monto)}</p>
                  <p className="text-gray-600 dark:text-slate-400">
                    {row.motivo || 'Sin concepto'}
                    <span className="text-xs text-gray-400 dark:text-slate-500 ml-1">
                      · {row.registrado_por || '—'} · {fmtFechaHora(row.fecha)}
                    </span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default IngresosEfectivo
