import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, AlertCircle } from 'lucide-react'
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

  const registrarEfectivo = async (e) => {
    e.preventDefault()
    const m = parseMonto(monto)
    if (!Number.isFinite(m) || m <= 0) {
      setMensaje({ tipo: 'aviso', texto: 'Ingrese un monto válido mayor a 0.' })
      return
    }
    setGuardandoEf(true)
    setMensaje(null)
    try {
      await retirosAPI.efectivo({
        monto: m,
        metodo_pago: 'efectivo',
        motivo: motivoEf.trim() || undefined
      })
      setMensaje({
        tipo: 'ok',
        texto: `Retiro de ${fmtMoney(m)} registrado. Se resta en el arqueo/cierre del turno.`
      })
      setMonto('')
      setMotivoEf('')
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
        onSubmit={registrarEfectivo}
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
    </div>
  )
}

export default Retiros
