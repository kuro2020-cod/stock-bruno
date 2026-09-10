import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Banknote, Calendar, CheckCircle2, Printer, AlertCircle } from 'lucide-react'
import { cierreCajaAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { hoyLocalISO } from '../utils/fechas'
import { claseMontoNeto } from '../utils/cierreCajaDisplay'
import ContadorCafeMaquina from '../components/ContadorCafeMaquina'

const fmtMoney = (n) =>
  `$${Number(n || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const labels = {
  efectivo: 'EFECTIVO',
  transferencia: 'TRANSFERENCIA',
  tarjeta: 'TARJETA',
  fiado: 'FIADO',
  sin_definir: 'SIN DEFINIR'
}

const labelsProv = {
  efectivo: 'EFECTIVO',
  transferencia: 'TRANSFERENCIA'
}

const TarjetaMetodo = ({ titulo, subtitulo, metodos, keys, colorClass = 'text-gray-900', negativo = false }) => (
  <div className="space-y-2">
    <div>
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{titulo}</p>
      {subtitulo && <p className="text-[11px] text-gray-400">{subtitulo}</p>}
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      {keys.map((key) => {
        const m = metodos[key] || {}
        const total = negativo ? Number(m.total || 0) : Number(m.neto ?? m.total ?? 0)
        return (
          <div key={key} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{labels[key] || labelsProv[key] || key}</p>
            <p className={`text-xl font-bold mt-1 ${negativo ? 'text-red-600' : claseMontoNeto(total)}`}>
              {negativo && total > 0 ? `-${fmtMoney(total)}` : fmtMoney(total)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{m.movimientos || 0} mov.</p>
          </div>
        )
      })}
    </div>
  </div>
)

const CierreCaja = () => {
  const location = useLocation()
  const { marcarCajaCerrada, cajaBloqueada, user } = useAuth()
  const esAdmin = user?.rol === 'ADMIN'
  const [fecha, setFecha] = useState(() => hoyLocalISO())
  const [resumen, setResumen] = useState(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [observaciones, setObservaciones] = useState('')
  /** 'mismo' = dejar el monto de apertura; 'otro' = monto distinto (solo ADMIN) */
  const [fondoModo, setFondoModo] = useState('mismo')
  const [fondoOtro, setFondoOtro] = useState('')

  const ventasMetodos = useMemo(() => resumen?.metodos || {}, [resumen])
  const proveedoresMetodos = useMemo(() => resumen?.pagosProveedores?.metodos || {}, [resumen])
  const listaProveedores = useMemo(() => resumen?.pagosProveedores?.lista || [], [resumen])
  const listaRetiros = useMemo(() => resumen?.retirosEfectivo?.lista || [], [resumen])
  const listaIngresos = useMemo(() => resumen?.ingresosEfectivo?.lista || [], [resumen])

  const aperturaEstado = resumen?.aperturaCaja
  const aperturaAbierta = aperturaEstado?.apertura || null
  const montoApertura =
    aperturaAbierta?.monto_apertura != null ? Number(aperturaAbierta.monto_apertura) : null
  const hayInicioCaja = Boolean(aperturaAbierta)

  const fondoPreview = useMemo(() => {
    if (!hayInicioCaja || montoApertura == null) return null
    // USER siempre deja el mismo monto de apertura.
    if (!esAdmin || fondoModo === 'mismo') return Math.round(montoApertura * 100) / 100
    const raw = String(fondoOtro)
      .trim()
      .replace(',', '.')
    const n = parseFloat(raw)
    if (!Number.isFinite(n) || n < 0) return null
    return Math.round(n * 100) / 100
  }, [hayInicioCaja, montoApertura, fondoModo, fondoOtro, esAdmin])

  useEffect(() => {
    if (!esAdmin) setFondoModo('mismo')
  }, [esAdmin])

  const diferenciaFondo = useMemo(() => {
    if (fondoPreview == null || montoApertura == null) return 0
    // Dejar más que el inicio → resta; dejar menos → suma.
    return Math.round((montoApertura - fondoPreview) * 100) / 100
  }, [fondoPreview, montoApertura])

  const efectivoNetoBase = Number(resumen?.metodos?.efectivo?.neto ?? resumen?.metodos?.efectivo?.total ?? 0)
  const efectivoNetoAjustado = Math.round((efectivoNetoBase + diferenciaFondo) * 100) / 100
  const netoDiaAjustado = Math.round((Number(resumen?.totalGeneralNeto || 0) + diferenciaFondo) * 100) / 100

  const cierresDelDia = resumen?.cierresDelDia ?? 0
  const cierresMiosEnFecha = resumen?.cierresMiosEnFecha ?? 0
  const puedeConfirmarCierre = !cajaBloqueada && hayInicioCaja

  const cargar = async (fechaTarget = fecha) => {
    setLoading(true)
    try {
      const { data } = await cierreCajaAPI.getResumen(fechaTarget)
      setResumen(data)
      // Turno abierto que cruzó medianoche: usar la fecha de inicio de caja.
      if (data?.fecha && data.fecha !== fechaTarget) {
        setFecha(data.fecha)
      }
      const mon = data?.aperturaCaja?.apertura?.monto_apertura
      if (mon != null && Number.isFinite(Number(mon))) {
        setFondoModo('mismo')
        setFondoOtro(String(mon))
      }
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudo cargar el resumen de caja')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargar(fecha)
  }, [fecha])

  useEffect(() => {
    if (location.pathname === '/cierre-caja') {
      cargar(fecha)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const imprimirOPdf = () => {
    window.print()
  }

  const resolverFondoSiguiente = () => fondoPreview

  const confirmarCierre = async () => {
    if (!fecha) return
    if (!puedeConfirmarCierre) return
    if (!hayInicioCaja) {
      alert('No hay inicio de caja. Entrá a Ventas y registrá el monto de INICIO DE CAJA.')
      return
    }
    const fondo = resolverFondoSiguiente()
    if (fondo == null) {
      alert('Indicá el monto a dejar en caja para el siguiente turno (0 o más).')
      return
    }
    const msg =
      `Confirma el cierre de caja del ${fecha}?\n\n` +
      `Inicio de caja: ${fmtMoney(montoApertura)}\n` +
      `Fondo para el siguiente turno: ${fmtMoney(fondo)}\n` +
      (diferenciaFondo !== 0
        ? `Ajuste al efectivo: ${diferenciaFondo > 0 ? '+' : ''}${fmtMoney(diferenciaFondo)}\n`
        : '')
    if (!window.confirm(msg)) return
    setSubmitting(true)
    try {
      const { data } = await cierreCajaAPI.cerrar({
        fecha,
        observaciones: observaciones || undefined,
        fondo_siguiente: fondo
      })
      const cierre = data?.cierre
      if (cierre) {
        let det = cierre.detalle_metodos
        if (typeof det === 'string') {
          try {
            det = JSON.parse(det)
          } catch {
            det = { v: 2 }
          }
        }
        if (!det || typeof det !== 'object') det = { v: 2 }

        if (!det.rubros && data?.resumen?.rubros?.lista) {
          det = {
            ...det,
            rubros: Object.fromEntries(
              data.resumen.rubros.lista.map((r) => [
                r.key,
                {
                  label: r.label,
                  total: r.total,
                  movimientos: r.movimientos,
                  unidades: r.unidades
                }
              ])
            )
          }
        }

        // Asegurar apertura/cierre de caja en el detalle del turno (modal final).
        if (!det.apertura_caja) {
          const desdeResumen = data?.resumen?.detalleCierre?.apertura_caja
          if (desdeResumen) {
            det = { ...det, apertura_caja: desdeResumen }
          } else if (data?.monto_apertura != null || data?.fondo_siguiente != null) {
            det = {
              ...det,
              apertura_caja: {
                monto_apertura: data.monto_apertura,
                fondo_siguiente: data.fondo_siguiente,
                diferencia_fondo: data.diferencia_fondo,
                apertura_at: aperturaAbierta?.created_at || null,
                registrado_por: aperturaAbierta?.registrado_por || null
              }
            }
          }
        }

        cierre.detalle_metodos = det
      }
      marcarCajaCerrada(cierre)
      alert(
        `Cierre de caja registrado.\n` +
          `Se dejó ${fmtMoney(fondo)} en caja para el siguiente turno.\n` +
          `Cerrá sesión para finalizar tu turno; podés volver a entrar y operar cuando corresponda.`
      )
      setObservaciones('')
      await cargar(fecha)
    } catch (e) {
      alert(e.response?.data?.error || 'No se pudo registrar el cierre')
    } finally {
      setSubmitting(false)
    }
  }

  const keysVentas = Object.keys(labels)

  return (
    <div className="max-w-5xl">
      <div className="hidden print:block print:mb-6 text-center border-b border-gray-300 pb-4">
        <p className="text-lg font-bold text-gray-900">Cierre de caja</p>
        <p className="text-sm text-gray-600">Fecha: {fecha}</p>
        {aperturaAbierta?.created_at && (
          <p className="text-sm text-gray-600">
            Apertura:{' '}
            {new Date(aperturaAbierta.created_at).toLocaleString('es-AR', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}
          </p>
        )}
      </div>

      <div className="mb-8 print:hidden">
        <h2 className="page-title">
          <Banknote className="text-brand-600" size={32} />
          Cierre de caja
        </h2>
        <p className="text-gray-600 mt-2">
          Revisá ventas, pagos a proveedores y el neto por método. Si el turno sigue abierto después de las 00, se
          cuentan todas las ventas desde el inicio de caja (no se reinicia a cero). Si ya hubo cierres en el turno,
          solo se incluyen los movimientos posteriores al último cierre.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow border border-gray-100 p-5 mb-6 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
              <Calendar size={14} />
              Fecha del cierre
            </label>
            <input
              type="date"
              value={fecha}
              max={hoyLocalISO()}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => cargar(fecha)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Actualizar resumen
            </button>
            <button
              type="button"
              disabled={submitting || loading || !fecha || !puedeConfirmarCierre}
              onClick={confirmarCierre}
              className="px-4 py-2 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 disabled:opacity-50"
              title={
                cajaBloqueada
                  ? 'Cerrá sesión para terminar este turno; después podés volver a operar.'
                  : !hayInicioCaja
                    ? 'Registrá el inicio de caja en Ventas antes de cerrar.'
                    : undefined
              }
            >
              {submitting ? 'Cerrando...' : 'Confirmar cierre'}
            </button>
            <button
              type="button"
              disabled={loading || !resumen}
              onClick={imprimirOPdf}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              title="Abre el cuadro de impresión del navegador; elegí Guardar como PDF"
            >
              <Printer size={18} />
              Imprimir / PDF
            </button>
          </div>
        </div>
      </div>

      {resumen?.turnoAbiertoCruzaMedianoche && hayInicioCaja && (
        <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950 print:hidden">
          <p className="font-semibold">Turno que cruzó medianoche</p>
          <p className="mt-1 text-xs leading-relaxed">
            Los totales incluyen todas las ventas desde el inicio de caja
            {aperturaAbierta?.created_at
              ? ` (${new Date(aperturaAbierta.created_at).toLocaleString('es-AR')})`
              : ''}{' '}
            hasta ahora, aunque haya cambiado el día. La fecha del cierre queda con el día en que abrieron caja (
            {fecha}).
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-500 py-12">Cargando resumen de caja...</div>
      ) : (
        <>
          {!hayInicioCaja && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 print:hidden">
              <div className="font-semibold flex items-center gap-2">
                <AlertCircle size={16} />
                Sin inicio de caja
              </div>
              <p className="mt-1 text-xs">
                Entrá a <strong>Ventas</strong> y registrá el monto de <strong>INICIO DE CAJA</strong> antes de
                poder cerrar.
              </p>
            </div>
          )}

          {hayInicioCaja && (
            <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-950 print:border-gray-300 print:bg-white">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-700 print:text-gray-500">
                Inicio de caja del turno
              </p>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80">
                    Monto de apertura
                  </p>
                  <p className="text-2xl font-extrabold tabular-nums text-emerald-900">
                    {fmtMoney(montoApertura)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700/80">
                    Horario de apertura
                  </p>
                  <p className="text-lg font-bold text-emerald-900 mt-0.5">
                    {aperturaAbierta?.created_at
                      ? new Date(aperturaAbierta.created_at).toLocaleString('es-AR', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : '—'}
                  </p>
                  <p className="text-[11px] text-emerald-800/80 mt-0.5">
                    Momento en que se confirmó el ingreso en Ventas
                  </p>
                </div>
              </div>
              {aperturaAbierta?.registrado_por && (
                <p className="text-xs text-emerald-800 mt-2">
                  Registrado por: {aperturaAbierta.registrado_por}
                </p>
              )}

              {esAdmin && (
              <div className="mt-4 pt-3 border-t border-emerald-200/80 print:hidden space-y-3">
                <p className="text-xs font-semibold text-emerald-900">
                  ¿Cuánto dejás en caja para el siguiente turno?
                </p>
                <div className="flex flex-col sm:flex-row gap-3">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="fondo-modo"
                      checked={fondoModo === 'mismo'}
                      onChange={() => setFondoModo('mismo')}
                      className="accent-emerald-600"
                    />
                    <span>
                      Dejar el mismo monto ({fmtMoney(montoApertura)})
                    </span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="fondo-modo"
                      checked={fondoModo === 'otro'}
                      onChange={() => setFondoModo('otro')}
                      className="accent-emerald-600"
                    />
                    <span>Otro monto</span>
                  </label>
                </div>
                {fondoModo === 'otro' && (
                  <div className="max-w-xs">
                    <label htmlFor="fondo-siguiente" className="text-xs font-medium text-gray-600 block mb-1">
                      Monto a dejar en caja
                    </label>
                    <input
                      id="fondo-siguiente"
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={fondoOtro}
                      onChange={(e) => setFondoOtro(e.target.value)}
                      className="w-full px-3 py-2 border border-emerald-300 rounded-lg text-sm font-semibold tabular-nums"
                      placeholder="0,00"
                    />
                  </div>
                )}
                {fondoPreview != null && (
                  <div
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      diferenciaFondo === 0
                        ? 'border-emerald-200 bg-white text-emerald-900'
                        : diferenciaFondo > 0
                          ? 'border-sky-200 bg-sky-50 text-sky-950'
                          : 'border-amber-200 bg-amber-50 text-amber-950'
                    }`}
                  >
                    <p className="font-semibold">
                      Diferencia de fondo:{' '}
                      <span className="tabular-nums">
                        {diferenciaFondo > 0 ? '+' : ''}
                        {fmtMoney(diferenciaFondo)}
                      </span>
                    </p>
                    <p className="mt-1 opacity-90">
                      {diferenciaFondo === 0
                        ? 'Sin cambio: el efectivo del cierre no se ajusta.'
                        : diferenciaFondo < 0
                          ? `Dejás más que el inicio: se resta del efectivo neto (inicio ${fmtMoney(montoApertura)} → deja ${fmtMoney(fondoPreview)}).`
                          : `Dejás menos que el inicio: se suma al efectivo neto (inicio ${fmtMoney(montoApertura)} → deja ${fmtMoney(fondoPreview)}).`}
                    </p>
                    <p className="mt-1.5 font-semibold tabular-nums">
                      Efectivo neto del turno: {fmtMoney(efectivoNetoAjustado)}
                      {diferenciaFondo !== 0 && (
                        <span className="font-normal opacity-80">
                          {' '}
                          (base {fmtMoney(efectivoNetoBase)}
                          {diferenciaFondo > 0 ? ' + ' : ' − '}
                          {fmtMoney(Math.abs(diferenciaFondo))})
                        </span>
                      )}
                    </p>
                  </div>
                )}
                <p className="text-[11px] text-emerald-800/90">
                  Ese monto se sugerirá automáticamente en el próximo inicio de caja.
                </p>
              </div>
              )}
              {!esAdmin && hayInicioCaja && (
                <p className="mt-3 text-[11px] text-emerald-800/90 print:hidden">
                  Se deja el mismo monto de inicio ({fmtMoney(montoApertura)}) para el próximo turno.
                </p>
              )}
            </div>
          )}

          {(cierresDelDia > 0 || resumen?.cierreExistente || cierresMiosEnFecha > 0) && (
            <div
              className={`mb-4 rounded-lg border px-4 py-3 text-sm print:border-gray-300 print:bg-white print:text-gray-900 ${
                cajaBloqueada
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-emerald-200 bg-emerald-50 text-emerald-800'
              }`}
            >
              <div className="font-semibold flex items-center gap-2">
                <CheckCircle2 size={16} />
                {cierresDelDia > 1
                  ? `${cierresDelDia} cierres registrados este día (todos los usuarios)`
                  : cierresDelDia === 1
                    ? '1 cierre registrado este día'
                    : 'Sin cierres para esta fecha'}
              </div>
              {resumen?.cierreExistente && (
                <div className="mt-1 text-emerald-900">
                  Último del día: {resumen.cierreExistente.cerrado_por || 'Sistema'} — Neto{' '}
                  {fmtMoney(resumen.cierreExistente.total_general)}
                  {resumen.cierreExistente.created_at
                    ? ` — ${new Date(resumen.cierreExistente.created_at).toLocaleString('es-AR')}`
                    : ''}
                </div>
              )}
              {cierresMiosEnFecha > 0 && (
                <p className="mt-2 text-xs text-emerald-800">
                  Vos registraste {cierresMiosEnFecha} cierre{cierresMiosEnFecha > 1 ? 's' : ''} en esta fecha. Podés
                  hacer otro al finalizar un nuevo turno.
                </p>
              )}
              {cajaBloqueada && (
                <p className="mt-2 text-xs text-amber-800">
                  Cerrá sesión para salir de este turno. Al volver a entrar podés vender y, si corresponde, registrar
                  otro cierre.
                </p>
              )}
            </div>
          )}

          {resumen?.esCierreParcialDelDia && resumen?.desdeUltimoCierre && (
            <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 print:hidden">
              <strong>Turno actual:</strong> este resumen incluye solo ventas y pagos registrados después del último
              cierre del día (
              {new Date(resumen.desdeUltimoCierre).toLocaleString('es-AR', {
                dateStyle: 'short',
                timeStyle: 'short'
              })}
              ).
            </div>
          )}

          <div className="space-y-6 mb-6">
            <TarjetaMetodo
              titulo="Ingresos por método"
              subtitulo="Ventas + cobros de fiados (neto por medio)"
              metodos={ventasMetodos}
              keys={keysVentas}
            />

            <TarjetaMetodo
              titulo="Pagos a proveedores"
              subtitulo="Egresos del día (se restan en el neto)"
              metodos={proveedoresMetodos}
              keys={Object.keys(labelsProv)}
              negativo
            />

            {Array.isArray(resumen?.rubros?.lista) && resumen.rubros.lista.length > 0 && (
              <div className="space-y-2">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
                    Discriminación de rubros
                  </p>
                  <p className="text-[11px] text-gray-400">
                    Milanesas (incluye sandwich y rollitos), cigarrillos (suelto o caja), café máquina y electrónica
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {resumen.rubros.lista.map((r) => (
                    <div key={r.key} className="bg-white rounded-xl border border-violet-200 p-4">
                      <p className="text-xs text-gray-500 font-semibold">{r.label}</p>
                      <p className="text-xl font-bold mt-1 text-violet-900 tabular-nums">
                        {fmtMoney(r.total)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {r.movimientos || 0} mov. ·{' '}
                        {Number(r.unidades || 0).toLocaleString('es-ES', { maximumFractionDigits: 3 })} u.
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {resumen?.cafeMaquina?.actual && (
              <ContadorCafeMaquina resumen={resumen.cafeMaquina} showHistorial />
            )}
          </div>

          {listaProveedores.length > 0 && (
            <div className="bg-white rounded-xl border border-red-100 p-4 mb-6 print:border-gray-200">
              <p className="text-sm font-semibold text-red-900 mb-3">Detalle pagos a proveedores ({listaProveedores.length})</p>
              <ul className="space-y-2 text-sm">
                {listaProveedores.map((p) => (
                  <li key={p.id} className="flex flex-wrap justify-between gap-2 border-b border-gray-50 pb-2 last:border-0">
                    <span className="text-gray-800">
                      <strong>{p.proveedor}</strong>
                      {p.concepto ? ` — ${p.concepto}` : ''}
                    </span>
                    <span className="font-semibold text-red-700">{fmtMoney(p.monto_total)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(listaRetiros.length > 0 || Number(resumen?.totalGeneralRetiros) > 0) && (
            <div className="bg-white rounded-xl border border-orange-100 p-4 mb-6">
              <p className="text-sm font-semibold text-orange-900 mb-1">
                Retiros de efectivo ({listaRetiros.length})
              </p>
              <p className="text-[11px] text-gray-500 mb-3">Se restan del neto del turno</p>
              {listaRetiros.length > 0 && (
                <ul className="space-y-2 text-sm mb-3">
                  {listaRetiros.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                    >
                      <span className="text-gray-800">
                        <strong>{r.metodo_pago || 'efectivo'}</strong>
                        {r.motivo ? ` — ${r.motivo}` : ''}
                        <span className="text-xs text-gray-500 ml-1">({r.registrado_por || '—'})</span>
                      </span>
                      <span className="font-semibold text-orange-700">{fmtMoney(r.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-right text-sm font-bold text-orange-800">
                Total retiros: -{fmtMoney(resumen?.totalGeneralRetiros || 0).replace('$', '')}
              </p>
            </div>
          )}

          {(listaIngresos.length > 0 || Number(resumen?.totalGeneralIngresosEfectivo) > 0) && (
            <div className="bg-white rounded-xl border border-sky-100 p-4 mb-6">
              <p className="text-sm font-semibold text-sky-900 mb-1">
                Ingresos de efectivo ({listaIngresos.length})
              </p>
              <p className="text-[11px] text-gray-500 mb-3">Se suman al efectivo del turno</p>
              {listaIngresos.length > 0 && (
                <ul className="space-y-2 text-sm mb-3">
                  {listaIngresos.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap justify-between gap-2 border-b border-gray-50 pb-2 last:border-0"
                    >
                      <span className="text-gray-800">
                        <strong>efectivo</strong>
                        {r.motivo ? ` — ${r.motivo}` : ''}
                        <span className="text-xs text-gray-500 ml-1">({r.registrado_por || '—'})</span>
                      </span>
                      <span className="font-semibold text-sky-700">{fmtMoney(r.monto)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-right text-sm font-bold text-sky-800">
                Total ingresos: +{fmtMoney(resumen?.totalGeneralIngresosEfectivo || 0).replace('$', '')}
              </p>
            </div>
          )}

          <p className="text-xs text-gray-500 mb-6 print:hidden">
            Los totales incluyen todas las ventas, pagos a proveedores, retiros e ingresos del {fecha}. Pulsá «Actualizar resumen» si
            registraste algo reciente.
          </p>

          <div className="bg-white rounded-xl shadow border border-gray-100 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">Ventas (movimientos)</p>
                <p className="text-2xl font-bold text-gray-900">{resumen?.totalMovimientos || 0}</p>
              </div>
              <div className="flex flex-wrap gap-6 sm:justify-end">
                <div>
                  <p className="text-sm text-gray-500">Total ventas</p>
                  <p className="text-xl font-bold text-emerald-700">{fmtMoney(resumen?.totalGeneralVentas || 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total proveedores</p>
                  <p className="text-xl font-bold text-red-600">-{fmtMoney(resumen?.totalGeneralProveedores || 0).replace('$', '')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total retiros</p>
                  <p className="text-xl font-bold text-orange-700">-{fmtMoney(resumen?.totalGeneralRetiros || 0).replace('$', '')}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total ingresos</p>
                  <p className="text-xl font-bold text-sky-700">+{fmtMoney(resumen?.totalGeneralIngresosEfectivo || 0).replace('$', '')}</p>
                </div>
                {diferenciaFondo !== 0 && (
                  <div>
                    <p className="text-sm text-gray-500">Ajuste fondo caja</p>
                    <p
                      className={`text-xl font-bold tabular-nums ${
                        diferenciaFondo > 0 ? 'text-sky-700' : 'text-amber-700'
                      }`}
                    >
                      {diferenciaFondo > 0 ? '+' : ''}
                      {fmtMoney(diferenciaFondo)}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-gray-500">Efectivo neto</p>
                  <p className={`text-xl font-bold tabular-nums ${claseMontoNeto(efectivoNetoAjustado)}`}>
                    {fmtMoney(efectivoNetoAjustado)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Neto del día</p>
                  <p className={`text-3xl font-extrabold ${claseMontoNeto(netoDiaAjustado)}`}>
                    {fmtMoney(netoDiaAjustado)}
                  </p>
                </div>
              </div>
            </div>

            <label className="text-xs font-medium text-gray-600">Observaciones del cierre (opcional)</label>
            <textarea
              value={observaciones}
              onChange={(e) => setObservaciones(e.target.value)}
              rows={3}
              placeholder="Ej. Caja verificada, sin diferencias."
              className="w-full mt-1 px-3 py-2 border rounded-lg text-sm"
            />
          </div>
        </>
      )}
    </div>
  )
}

export default CierreCaja
