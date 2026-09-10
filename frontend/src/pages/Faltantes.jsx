import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  CheckCircle2,
  AlertCircle,
  PackageMinus,
  AlertTriangle,
  Search,
  Mail,
  Send,
  Plus,
  X
} from 'lucide-react'
import { categoriasAPI, faltantesAPI, productosAPI, reporteFaltantesAPI } from '../services/api'
import CategoriaProductoSelect from '../components/CategoriaProductoSelect'
import { hoyLocalISO } from '../utils/fechas'
import { fmtCantidadStock } from '../utils/unidades'
import { useAuth } from '../context/AuthContext'

const STOCK_PAGE_SIZE = 10

const nombreFaltante = (row) =>
  String(row?.producto_catalogo || row?.producto_texto || '').trim() || '—'

const cantidadFaltanteLabel = (row) => {
  if (row?.cantidad != null && row.cantidad !== '') {
    const n = Number(row.cantidad)
    if (Number.isFinite(n)) return fmtCantidadStock(n, row.producto_unidad || 'unidad')
  }
  return '—'
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const parseEmailsUi = (raw) => {
  const partes = Array.isArray(raw)
    ? raw.flatMap((s) => String(s || '').split(/[,;\n]+/))
    : String(raw || '').split(/[,;\n]+/)
  const out = []
  const seen = new Set()
  for (const p of partes) {
    const e = String(p || '').trim().toLowerCase()
    if (!EMAIL_RE.test(e) || seen.has(e)) continue
    seen.add(e)
    out.push(e)
  }
  return out
}

const Faltantes = () => {
  const { user } = useAuth()
  const isAdmin = user?.rol === 'ADMIN'
  const hoy = hoyLocalISO()
  const [tab, setTab] = useState('registros')
  const [desde, setDesde] = useState(hoy)
  const [hasta, setHasta] = useState(hoy)
  const [lista, setLista] = useState([])
  const [loading, setLoading] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [productoTexto, setProductoTexto] = useState('')
  const [guardando, setGuardando] = useState(false)

  const [stockBajo, setStockBajo] = useState([])
  const [categorias, setCategorias] = useState([])
  const [loadingStock, setLoadingStock] = useState(false)
  const [errorStock, setErrorStock] = useState(null)
  const [busquedaStock, setBusquedaStock] = useState('')
  const [paginaStock, setPaginaStock] = useState(1)

  const [cfgEmails, setCfgEmails] = useState(['bruno.german99@gmail.com'])
  const [cfgEmailDraft, setCfgEmailDraft] = useState('')
  const [cfgHora, setCfgHora] = useState('22:00')
  const [cfgActivo, setCfgActivo] = useState(true)
  const [cfgSmtpOk, setCfgSmtpOk] = useState(false)
  const [cfgLoading, setCfgLoading] = useState(false)
  const [cfgSaving, setCfgSaving] = useState(false)
  const [cfgSending, setCfgSending] = useState(false)
  const [cfgMsg, setCfgMsg] = useState(null)

  const loadLista = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await faltantesAPI.listar({
        desde: desde || undefined,
        hasta: hasta || undefined,
        solo_manual: 1,
        limit: 1000
      })
      setLista(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error(e)
      setMensaje({
        tipo: 'aviso',
        texto: e.response?.data?.error || 'No se pudieron cargar los faltantes'
      })
    } finally {
      setLoading(false)
    }
  }, [desde, hasta])

  const loadStockBajo = useCallback(async () => {
    setLoadingStock(true)
    setErrorStock(null)
    try {
      const [{ data }, cats] = await Promise.all([
        productosAPI.getLowStock(),
        categoriasAPI.getAll().catch(() => ({ data: [] }))
      ])
      setStockBajo(Array.isArray(data) ? data : [])
      setCategorias(Array.isArray(cats.data) ? cats.data : [])
    } catch (e) {
      console.error(e)
      setErrorStock(e.response?.data?.error || 'No se pudo cargar el stock bajo')
      setStockBajo([])
    } finally {
      setLoadingStock(false)
    }
  }, [])

  useEffect(() => {
    if (tab === 'registros') {
      loadLista()
    }
  }, [tab, loadLista])

  useEffect(() => {
    if (tab === 'stock_bajo') loadStockBajo()
  }, [tab, loadStockBajo])

  const stockBajoFiltrado = useMemo(() => {
    const q = busquedaStock.trim().toLowerCase()
    if (!q) return stockBajo
    return stockBajo.filter((p) => {
      const codigo = String(p.codigo || '').toLowerCase()
      const nombre = String(p.nombre || '').toLowerCase()
      const categoria = String(p.categoria_nombre || '').toLowerCase()
      return codigo.includes(q) || nombre.includes(q) || categoria.includes(q)
    })
  }, [stockBajo, busquedaStock])

  const totalPaginasStock = Math.max(1, Math.ceil(stockBajoFiltrado.length / STOCK_PAGE_SIZE))
  const paginaStockSafe = Math.min(paginaStock, totalPaginasStock)
  const startStock = (paginaStockSafe - 1) * STOCK_PAGE_SIZE
  const stockBajoPagina = stockBajoFiltrado.slice(startStock, startStock + STOCK_PAGE_SIZE)

  useEffect(() => {
    setPaginaStock(1)
  }, [busquedaStock, stockBajo])

  const listaManual = useMemo(
    () =>
      [...lista].sort((a, b) =>
        nombreFaltante(a).localeCompare(nombreFaltante(b), 'es', { sensitivity: 'base' })
      ),
    [lista]
  )

  const loadConfigReporte = useCallback(async () => {
    if (!isAdmin) return
    setCfgLoading(true)
    try {
      const { data } = await reporteFaltantesAPI.getConfig()
      setCfgEmails(parseEmailsUi(data.emails || data.email_destino || ''))
      setCfgHora(data.hora_envio || '22:00')
      setCfgActivo(Boolean(data.activo))
      setCfgSmtpOk(Boolean(data.smtp_configurado))
    } catch (e) {
      console.error(e)
      setCfgMsg({
        tipo: 'aviso',
        texto: e.response?.data?.error || 'No se pudo cargar la configuración del reporte'
      })
    } finally {
      setCfgLoading(false)
    }
  }, [isAdmin])

  useEffect(() => {
    loadConfigReporte()
  }, [loadConfigReporte])

  const agregarCfgEmail = () => {
    const nuevos = parseEmailsUi(cfgEmailDraft)
    if (!nuevos.length) {
      setCfgMsg({ tipo: 'aviso', texto: 'Ingresá un correo válido (podés pegar varios separados por coma).' })
      return false
    }
    setCfgEmails((prev) => {
      const seen = new Set(prev)
      const extra = nuevos.filter((e) => !seen.has(e))
      return extra.length ? [...prev, ...extra] : prev
    })
    setCfgEmailDraft('')
    return true
  }

  const quitarCfgEmail = (email) => {
    setCfgEmails((prev) => prev.filter((e) => e !== email))
  }

  const guardarConfigReporte = async (e) => {
    e.preventDefault()
    let destinos = cfgEmails
    const draft = cfgEmailDraft.trim()
    if (draft) {
      const extra = parseEmailsUi(draft)
      if (!extra.length) {
        setCfgMsg({ tipo: 'aviso', texto: 'El correo a agregar no es válido.' })
        return
      }
      destinos = [...new Set([...cfgEmails, ...extra])]
      setCfgEmails(destinos)
      setCfgEmailDraft('')
    }
    if (!destinos.length) {
      setCfgMsg({ tipo: 'aviso', texto: 'Agregá al menos un correo destino.' })
      return
    }
    setCfgSaving(true)
    setCfgMsg(null)
    try {
      const { data } = await reporteFaltantesAPI.saveConfig({
        emails: destinos,
        email_destino: destinos.join(', '),
        hora_envio: cfgHora,
        activo: cfgActivo
      })
      setCfgEmails(parseEmailsUi(data.emails || data.email_destino || destinos))
      setCfgHora(data.hora_envio || cfgHora)
      setCfgActivo(Boolean(data.activo))
      setCfgSmtpOk(Boolean(data.smtp_configurado))
      setCfgMsg({ tipo: 'ok', texto: 'Configuración guardada. El envío programado se actualizó.' })
    } catch (err) {
      setCfgMsg({
        tipo: 'aviso',
        texto: err.response?.data?.error || 'No se pudo guardar la configuración'
      })
    } finally {
      setCfgSaving(false)
    }
  }

  const enviarReporteAhora = async () => {
    setCfgSending(true)
    setCfgMsg(null)
    try {
      const { data } = await reporteFaltantesAPI.enviarAhora()
      setCfgMsg({
        tipo: 'ok',
        texto: `Reporte enviado a ${data.email_destino} (${data.faltantes} faltantes, ${data.stock_bajo} stock bajo).`
      })
    } catch (err) {
      setCfgMsg({
        tipo: 'aviso',
        texto: err.response?.data?.error || 'No se pudo enviar el reporte'
      })
    } finally {
      setCfgSending(false)
    }
  }

  const registrar = async (e) => {
    e.preventDefault()
    const texto = productoTexto.trim()
    if (!texto) {
      setMensaje({ tipo: 'aviso', texto: 'Escribí qué producto falta.' })
      return
    }
    setGuardando(true)
    setMensaje(null)
    try {
      await faltantesAPI.registrar({
        tipo: 'faltante',
        producto_texto: texto,
        producto_id: null
      })
      setMensaje({ tipo: 'ok', texto: 'Registro guardado.' })
      setProductoTexto('')
      await loadLista()
    } catch (err) {
      setMensaje({
        tipo: 'aviso',
        texto: err.response?.data?.error || 'No se pudo guardar el registro'
      })
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      <header className="page-header mb-6">
        <h2 className="page-title flex items-center gap-2">
          <ClipboardList size={26} className="text-rose-600" />
          Faltantes
        </h2>
        <p className="page-subtitle">
          Anotá productos faltantes o revisá el listado de productos con stock bajo.
        </p>
      </header>

      <div className="flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm mb-6">
        <button
          type="button"
          onClick={() => setTab('registros')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold transition-colors ${
            tab === 'registros' ? 'bg-rose-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <ClipboardList size={18} />
          Registros
        </button>
        <button
          type="button"
          onClick={() => setTab('stock_bajo')}
          className={`flex-1 inline-flex items-center justify-center gap-1.5 sm:gap-2 rounded-lg px-2 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold transition-colors ${
            tab === 'stock_bajo' ? 'bg-amber-600 text-white' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <PackageMinus size={18} />
          Stock bajo
        </button>
      </div>

      {isAdmin && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                <Mail size={16} className="text-sky-600" />
                Reporte por email (ADMIN)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Envía 2 PDF (faltantes del día + stock bajo) a los correos configurados. Horario Argentina.
                {cfgLoading ? ' Cargando…' : ''}
              </p>
            </div>
            {!cfgSmtpOk && !cfgLoading && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                SMTP no configurado en el servidor (.env). Sin eso no se pueden enviar mails.
              </p>
            )}
          </div>

          {cfgMsg && (
            <div
              className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
                cfgMsg.tipo === 'ok'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-amber-200 bg-amber-50 text-amber-950'
              }`}
            >
              {cfgMsg.tipo === 'ok' ? (
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
              ) : (
                <AlertCircle size={18} className="shrink-0 mt-0.5" />
              )}
              <span>{cfgMsg.texto}</span>
            </div>
          )}

          <form
            onSubmit={guardarConfigReporte}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end"
          >
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Correos destino</label>
              {cfgEmails.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {cfgEmails.map((email) => (
                    <span
                      key={email}
                      className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3.5 py-1.5 text-sm font-medium text-sky-900"
                    >
                      {email}
                      <button
                        type="button"
                        onClick={() => quitarCfgEmail(email)}
                        className="rounded-full p-0.5 text-sky-700 hover:bg-sky-200"
                        aria-label={`Quitar ${email}`}
                      >
                        <X size={16} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  inputMode="email"
                  autoComplete="email"
                  value={cfgEmailDraft}
                  onChange={(e) => setCfgEmailDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      agregarCfgEmail()
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
                  placeholder="agregar@ejemplo.com"
                />
                <button
                  type="button"
                  onClick={agregarCfgEmail}
                  className="inline-flex items-center gap-1 shrink-0 px-3 py-2.5 rounded-xl border border-sky-300 text-sky-800 text-sm font-semibold hover:bg-sky-50"
                >
                  <Plus size={16} />
                  Agregar
                </button>
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Podés agregar varios. También pegá varios separados por coma.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Hora de envío</label>
              <input
                type="time"
                value={cfgHora}
                onChange={(e) => setCfgHora(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <input
                id="cfg-activo"
                type="checkbox"
                checked={cfgActivo}
                onChange={(e) => setCfgActivo(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-sky-600"
              />
              <label htmlFor="cfg-activo" className="text-sm text-gray-700">
                Envío automático activo
              </label>
            </div>
            <div className="sm:col-span-2 lg:col-span-4 flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={cfgSaving || cfgLoading}
                className="px-4 py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 disabled:opacity-50"
              >
                {cfgSaving ? 'Guardando…' : 'Guardar configuración'}
              </button>
              <button
                type="button"
                onClick={enviarReporteAhora}
                disabled={cfgSending || cfgLoading}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-sky-300 text-sky-800 font-semibold text-sm hover:bg-sky-50 disabled:opacity-50"
              >
                <Send size={16} />
                {cfgSending ? 'Enviando…' : 'Enviar reporte ahora'}
              </button>
            </div>
          </form>
        </div>
      )}

      {tab === 'registros' && mensaje && (
        <div
          className={`mb-4 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${
            mensaje.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : 'border-amber-200 bg-amber-50 text-amber-950'
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

      {tab === 'registros' ? (
        <>
          <form
            onSubmit={registrar}
            className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4 mb-6 dark:bg-slate-900 dark:border-slate-700"
          >
            <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide dark:text-slate-100">
              Nuevo registro
            </h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 dark:text-slate-200">
                Qué falta
              </label>
              <input
                type="text"
                value={productoTexto}
                onChange={(e) => setProductoTexto(e.target.value)}
                placeholder="Nombre del producto o descripción…"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-xl text-sm dark:bg-slate-950 dark:border-slate-600 dark:text-slate-100"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={guardando}
              className="px-5 py-2.5 rounded-xl bg-rose-600 text-white font-semibold text-sm hover:bg-rose-700 disabled:opacity-50"
            >
              {guardando ? 'Guardando…' : 'Guardar registro'}
            </button>
          </form>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-end gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                  Registros
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {loading ? 'Cargando…' : `${lista.length} registro(s) en el rango`}
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Desde</label>
                  <input
                    type="date"
                    value={desde}
                    onChange={(e) => setDesde(e.target.value)}
                    className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-0.5">Hasta</label>
                  <input
                    type="date"
                    value={hasta}
                    onChange={(e) => setHasta(e.target.value)}
                    className="px-2.5 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDesde(hoy)
                    setHasta(hoy)
                  }}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-rose-700 bg-rose-50 hover:bg-rose-100"
                >
                  Hoy
                </button>
              </div>
            </div>

            {lista.length === 0 && !loading ? (
              <div className="py-12 text-center text-gray-500 text-sm">
                No hay registros en este rango de fechas.
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50 sticky top-0 z-10 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase dark:text-slate-400">
                        Producto
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase dark:text-slate-400">
                        Cantidad
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {listaManual.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b border-gray-100 hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800/60"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-slate-50">
                          {nombreFaltante(row)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-semibold tabular-nums text-gray-900 dark:text-slate-100">
                          {cantidadFaltanteLabel(row)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-600" />
                  Productos con stock bajo
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {loadingStock
                    ? 'Cargando…'
                    : errorStock
                      ? errorStock
                      : busquedaStock.trim()
                        ? `${stockBajoFiltrado.length} de ${stockBajo.length} producto(s)`
                        : `${stockBajo.length} producto(s) en o por debajo del mínimo`}
                </p>
              </div>
              <button
                type="button"
                onClick={loadStockBajo}
                disabled={loadingStock}
                className="px-3 py-2 rounded-lg text-sm font-medium text-amber-800 bg-amber-50 hover:bg-amber-100 disabled:opacity-50"
              >
                Actualizar
              </button>
            </div>
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="search"
                value={busquedaStock}
                onChange={(e) => setBusquedaStock(e.target.value)}
                placeholder="Buscar por nombre o categoría…"
                className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-xl text-sm"
              />
            </div>
          </div>

          {errorStock && !loadingStock ? (
            <div className="py-12 text-center text-amber-800 text-sm">{errorStock}</div>
          ) : stockBajo.length === 0 && !loadingStock ? (
            <div className="py-12 text-center text-gray-500 text-sm">
              No hay productos con stock bajo en este momento.
            </div>
          ) : stockBajoFiltrado.length === 0 && !loadingStock ? (
            <div className="py-12 text-center text-gray-500 text-sm">
              Ningún producto coincide con la búsqueda.
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Producto
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Categoría
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Stock
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        Mínimo
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {stockBajoPagina.map((p) => (
                      <tr key={p.id} className="hover:bg-amber-50/40">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{p.nombre}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                          <CategoriaProductoSelect
                            productoId={p.id}
                            categoriaId={p.categoria_id}
                            categorias={categorias}
                            onSaved={(actualizado) =>
                              setStockBajo((prev) =>
                                prev.map((row) =>
                                  row.id === actualizado.id ? { ...row, ...actualizado } : row
                                )
                              )
                            }
                          />
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-bold text-red-600 tabular-nums">
                          {fmtCantidadStock(p.stock_actual, p.unidad_medida)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-600 tabular-nums">
                          {Number(p.stock_minimo) > 0
                            ? fmtCantidadStock(p.stock_minimo, p.unidad_medida)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t border-gray-200">
                <p className="text-sm text-gray-600">
                  Mostrando {stockBajoFiltrado.length === 0 ? 0 : startStock + 1} a{' '}
                  {Math.min(startStock + STOCK_PAGE_SIZE, stockBajoFiltrado.length)} de{' '}
                  {stockBajoFiltrado.length} productos
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPaginaStock((prev) => Math.max(prev - 1, 1))}
                    disabled={paginaStockSafe === 1}
                    className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Anterior
                  </button>
                  <span className="text-sm text-gray-700">
                    Página {paginaStockSafe} de {totalPaginasStock}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPaginaStock((prev) => Math.min(prev + 1, totalPaginasStock))}
                    disabled={paginaStockSafe === totalPaginasStock}
                    className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default Faltantes
