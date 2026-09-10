import { useEffect, useRef, useState, useCallback } from 'react'
import { productosAPI, movimientosAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  fmtCantidadStock,
  esVentaPorMedidaDecimal,
  etiquetaCantidadUnidad,
  redondearCantidad
} from '../utils/unidades'
import { productoNoControlaStock, esProductoSistema } from '../utils/stockProducto'
import {
  ScanBarcode,
  Keyboard,
  CheckCircle2,
  AlertCircle,
  Search,
  List,
  PackageMinus
} from 'lucide-react'

const MOTIVOS_BAJA = [
  'VENCIMIENTO',
  'ROTURA',
  'ROBO',
  'DIFERENCIA DE STOCK EN BALANCE',
  'RETIRO DUEÑO'
]

const BajaProductos = () => {
  const { user } = useAuth()
  const [modo, setModo] = useState('escaner')
  const [scanValue, setScanValue] = useState('')
  const [mensaje, setMensaje] = useState(null)
  const [listaProductos, setListaProductos] = useState([])
  const [loadingLista, setLoadingLista] = useState(false)
  const [busquedaLista, setBusquedaLista] = useState('')
  const [producto, setProducto] = useState(null)
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const inputScanRef = useRef(null)
  const inputCantidadRef = useRef(null)

  const focusScan = useCallback(() => {
    setTimeout(() => inputScanRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    if (modo === 'escaner' && !producto) focusScan()
  }, [modo, producto, focusScan])

  const loadListaProductos = useCallback(async () => {
    setLoadingLista(true)
    try {
      const { data } = await productosAPI.getAll()
      setListaProductos(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Error al cargar listado de productos:', e)
      setMensaje({ tipo: 'error', texto: 'No se pudo cargar el listado de productos.' })
    } finally {
      setLoadingLista(false)
    }
  }, [])

  useEffect(() => {
    loadListaProductos()
  }, [loadListaProductos])

  useEffect(() => {
    if (producto) {
      setTimeout(() => inputCantidadRef.current?.focus(), 80)
    }
  }, [producto?.id])

  const limpiarFormulario = (mantenerMensaje = false) => {
    setProducto(null)
    setCantidad('')
    setMotivo('')
    setScanValue('')
    if (!mantenerMensaje) setMensaje(null)
    if (modo === 'escaner') focusScan()
  }

  const seleccionarProducto = (p) => {
    setProducto(p)
    setCantidad('')
    setMotivo('')
    setMensaje(null)
    setScanValue('')
  }

  const buscarPorCodigo = async (raw) => {
    const codigo = String(raw).trim()
    if (!codigo) {
      setMensaje({ tipo: 'aviso', texto: 'Ingrese un código o escanéelo.' })
      return
    }
    try {
      const { data } = await productosAPI.getByCodigo(codigo)
      if (!data) {
        setMensaje({ tipo: 'error', texto: `No existe un producto con código "${codigo}".` })
        setScanValue('')
        focusScan()
        return
      }
      seleccionarProducto(data)
    } catch (e) {
      const status = e.response?.status
      setMensaje({
        tipo: 'error',
        texto:
          status === 404
            ? `No existe un producto con código "${codigo}".`
            : e.response?.data?.error || 'Error al buscar el producto.'
      })
      setScanValue('')
      focusScan()
    }
  }

  const onScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      buscarPorCodigo(scanValue)
    }
  }

  const parseCantidad = () => {
    const raw = String(cantidad).trim().replace(',', '.')
    if (!raw) return NaN
    if (producto && esVentaPorMedidaDecimal(producto.unidad_medida)) {
      return redondearCantidad(parseFloat(raw), 4)
    }
    return Math.floor(Number(raw))
  }

  const registrarBaja = async (e) => {
    e.preventDefault()
    if (!producto) {
      setMensaje({ tipo: 'aviso', texto: 'Seleccione o escanee un producto.' })
      return
    }
    if (!motivo) {
      setMensaje({ tipo: 'aviso', texto: 'Seleccione el motivo de baja.' })
      return
    }
    if (productoNoControlaStock(producto)) {
      setMensaje({
        tipo: 'aviso',
        texto: `"${producto.nombre}" no controla stock (producto elaborado). No aplica baja de inventario.`
      })
      return
    }
    const qty = parseCantidad()
    if (Number.isNaN(qty) || qty <= 0) {
      setMensaje({ tipo: 'aviso', texto: 'Ingrese una cantidad válida mayor a 0.' })
      return
    }
    const stock = Number(producto.stock_actual) || 0
    if (qty > stock + 1e-9) {
      setMensaje({
        tipo: 'error',
        texto: `Stock insuficiente. Disponible: ${fmtCantidadStock(stock, producto.unidad_medida)}.`
      })
      return
    }

    setGuardando(true)
    try {
      await movimientosAPI.create({
        producto_id: producto.id,
        tipo: 'baja',
        cantidad: qty,
        motivo
      })
      setMensaje({
        tipo: 'ok',
        texto: `Baja registrada: ${fmtCantidadStock(qty, producto.unidad_medida)} de "${producto.nombre}" — Motivo: ${motivo}.`
      })
      await loadListaProductos()
      limpiarFormulario(true)
    } catch (err) {
      setMensaje({
        tipo: 'error',
        texto: err.response?.data?.error || 'No se pudo registrar la baja.'
      })
    } finally {
      setGuardando(false)
    }
  }

  const productosListaFiltrados = listaProductos.filter((p) => {
    if (esProductoSistema(p)) return false
    const q = busquedaLista.trim().toLowerCase()
    if (!q) return true
    return (
      p.nombre?.toLowerCase().includes(q) ||
      String(p.codigo || '')
        .toLowerCase()
        .includes(q)
    )
  })

  const etiquetaUsuario =
    user?.nombre && user?.apellido
      ? `${user.apellido}, ${user.nombre}`
      : user?.usuario || 'Administrador'

  return (
    <div className="max-w-7xl">
      <div className="mb-8">
        <h2 className="page-title flex items-center gap-3">
          <PackageMinus className="text-rose-600" size={28} />
          Baja de productos
        </h2>
        <p className="text-gray-600 mt-2">
          Descontá stock por vencimiento, rotura, robo o diferencia de balance. Escaneá el código o elegí el producto de
          la lista, indicá la cantidad y el motivo. El stock se actualiza en la base de datos.
        </p>
      </div>

      <div className="flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm mb-8 w-fit">
        <button
          type="button"
          onClick={() => {
            setModo('escaner')
            setMensaje(null)
            if (!producto) focusScan()
          }}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
            modo === 'escaner' ? 'bg-rose-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <ScanBarcode size={20} />
          Lector / código
        </button>
        <button
          type="button"
          onClick={() => setModo('manual')}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
            modo === 'manual' ? 'bg-rose-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Keyboard size={20} />
          Desde listado
        </button>
      </div>

      {mensaje && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-lg p-4 ${
            mensaje.tipo === 'ok'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : mensaje.tipo === 'error'
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-amber-50 text-amber-900 border border-amber-200'
          }`}
        >
          {mensaje.tipo === 'ok' ? (
            <CheckCircle2 className="shrink-0 mt-0.5" size={20} />
          ) : (
            <AlertCircle className="shrink-0 mt-0.5" size={20} />
          )}
          <p className="text-sm">{mensaje.texto}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="space-y-6 min-w-0">
          {modo === 'escaner' && (
            <div className="bg-white rounded-xl shadow border border-gray-100 p-6">
              <label htmlFor="baja-scan-codigo" className="block text-sm font-medium text-gray-700 mb-2">
                Campo de captura (lector o teclado)
              </label>
              <input
                id="baja-scan-codigo"
                ref={inputScanRef}
                type="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Escanee o escriba el código y pulse Enter"
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={onScanKeyDown}
                className="w-full text-lg px-4 py-4 border-2 border-rose-200 rounded-xl focus:ring-2 focus:ring-rose-500 focus:border-rose-500 font-mono tracking-wide"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={!scanValue.trim()}
                  onClick={() => buscarPorCodigo(scanValue)}
                  className="bg-rose-600 text-white px-5 py-2.5 rounded-lg hover:bg-rose-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Buscar por código
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setScanValue('')
                    setMensaje(null)
                    focusScan()
                  }}
                  className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Limpiar
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl shadow border border-gray-100 p-6">
            <h3 className="font-semibold text-gray-800 mb-4">Registrar baja</h3>
            {!producto ? (
              <p className="text-sm text-gray-500">
                {modo === 'escaner'
                  ? 'Escaneá o buscá un producto para continuar.'
                  : 'Elegí un producto de la lista de la derecha.'}
              </p>
            ) : (
              <form onSubmit={registrarBaja} className="space-y-4">
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-4">
                  <p className="font-medium text-gray-900">{producto.nombre}</p>
                  <p className="text-xs font-mono text-gray-600 mt-1">{producto.codigo || 'Sin código'}</p>
                  <p className="text-sm text-gray-600 mt-2">
                    Stock actual:{' '}
                    <span className="font-semibold text-gray-900">
                      {fmtCantidadStock(producto.stock_actual ?? 0, producto.unidad_medida)}
                    </span>
                  </p>
                </div>

                <div>
                  <label htmlFor="baja-motivo" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Motivo de baja
                  </label>
                  <select
                    id="baja-motivo"
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-rose-500 focus:border-transparent"
                  >
                    <option value="">Seleccionar motivo…</option>
                    {MOTIVOS_BAJA.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="baja-cantidad" className="block text-sm font-medium text-gray-700 mb-1.5">
                    Cantidad a dar de baja {etiquetaCantidadUnidad(producto.unidad_medida)}
                  </label>
                  <input
                    id="baja-cantidad"
                    ref={inputCantidadRef}
                    type="number"
                    min={esVentaPorMedidaDecimal(producto.unidad_medida) ? 0.001 : 1}
                    step={esVentaPorMedidaDecimal(producto.unidad_medida) ? 0.001 : 1}
                    max={Number(producto.stock_actual) || undefined}
                    value={cantidad}
                    onChange={(e) => setCantidad(e.target.value)}
                    required
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-rose-500 focus:border-transparent tabular-nums"
                    placeholder={esVentaPorMedidaDecimal(producto.unidad_medida) ? 'Ej. 0.250' : 'Ej. 2'}
                  />
                </div>

                <p className="text-xs text-gray-500">Registrado por: {etiquetaUsuario}</p>

                <div className="flex flex-wrap gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={guardando}
                    className="bg-rose-600 text-white px-5 py-2.5 rounded-lg hover:bg-rose-700 disabled:opacity-50 font-medium"
                  >
                    {guardando ? 'Guardando…' : 'Confirmar baja'}
                  </button>
                  <button
                    type="button"
                    onClick={() => limpiarFormulario(false)}
                    className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[320px] max-h-[min(85vh,920px)] min-w-0">
          <div className="p-4 border-b border-gray-100 shrink-0">
            <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
              <List size={20} className="text-rose-600" />
              Productos en la base
            </h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input
                type="search"
                placeholder="Buscar por nombre o código…"
                value={busquedaLista}
                onChange={(e) => setBusquedaLista(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-rose-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            {loadingLista ? (
              <p className="text-sm text-gray-500 text-center py-8">Cargando productos…</p>
            ) : productosListaFiltrados.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">
                {listaProductos.length === 0
                  ? 'No hay productos cargados aún.'
                  : 'Ningún resultado con ese criterio.'}
              </p>
            ) : (
              <ul className="space-y-1">
                {productosListaFiltrados.map((p) => {
                  const seleccionado = producto?.id === p.id
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => seleccionarProducto(p)}
                        className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors border ${
                          seleccionado
                            ? 'bg-rose-50 border-rose-200 ring-1 ring-rose-200'
                            : 'border-transparent hover:bg-gray-50 hover:border-gray-100'
                        }`}
                      >
                        <p className="font-medium text-gray-900 text-sm leading-snug">{p.nombre}</p>
                        <p className="text-xs font-mono text-gray-600 mt-0.5">{p.codigo || 'Sin código'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          Stock: {fmtCantidadStock(p.stock_actual ?? 0, p.unidad_medida)}
                        </p>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BajaProductos
