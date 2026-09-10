import { useEffect, useRef, useState, useCallback } from 'react'
import { productosAPI } from '../services/api'
import { fmtCantidadStock } from '../utils/unidades'
import { esProductoSistema } from '../utils/stockProducto'
import { fmtFechaCorta } from '../utils/fechas'
import {
  ScanBarcode,
  Keyboard,
  CheckCircle2,
  AlertCircle,
  Search,
  List
} from 'lucide-react'
import ProductoModal from '../components/ProductoModal'

const CargaProductos = () => {
  const [modo, setModo] = useState('escaner')
  const [scanValue, setScanValue] = useState('')
  const [mensaje, setMensaje] = useState(null)
  const [showFormModal, setShowFormModal] = useState(false)
  const [codigoEscaneado, setCodigoEscaneado] = useState('')
  const [listaProductos, setListaProductos] = useState([])
  const [loadingLista, setLoadingLista] = useState(false)
  const [busquedaLista, setBusquedaLista] = useState('')
  const [codigoDesdeLista, setCodigoDesdeLista] = useState('')
  const inputScanRef = useRef(null)

  const focusScan = useCallback(() => {
    setTimeout(() => inputScanRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    if (modo === 'escaner' && !showFormModal) {
      focusScan()
    }
  }, [modo, showFormModal, focusScan])

  const loadListaProductos = useCallback(async () => {
    setLoadingLista(true)
    try {
      const { data } = await productosAPI.getAll()
      setListaProductos(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Error al cargar listado de productos:', e)
    } finally {
      setLoadingLista(false)
    }
  }, [])

  useEffect(() => {
    if (modo === 'manual') {
      loadListaProductos()
    }
  }, [modo, loadListaProductos])

  const limpiarEstadoScan = () => {
    setMensaje(null)
    setScanValue('')
    focusScan()
  }

  const abrirFormularioCodigo = (codigo) => {
    setCodigoEscaneado(codigo)
    setShowFormModal(true)
    setScanValue('')
    setMensaje(null)
  }

  const procesarCodigo = (raw) => {
    const codigo = String(raw).trim()
    if (!codigo) {
      setMensaje({ tipo: 'aviso', texto: 'Ingrese un código o escanéelo.' })
      return
    }
    abrirFormularioCodigo(codigo)
  }

  const onScanKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      procesarCodigo(scanValue)
    }
  }

  const cerrarFormModal = () => {
    setShowFormModal(false)
    setCodigoEscaneado('')
    focusScan()
  }

  const notificarIngresoGuardado = () => {
    setMensaje({
      tipo: 'ok',
      texto:
        'Cambios guardados: stock (si hubo ingreso), precios y datos del producto quedaron actualizados en la base de datos.'
    })
    loadListaProductos()
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

  return (
    <div className="max-w-7xl">
      <div className="mb-8">
        <h2 className="page-title">Carga de productos</h2>
        <p className="text-gray-600 mt-2">
          Use un lector de código de barras (se comporta como teclado: escribe el código y envía Enter) o complete el
          formulario manual. Al escanear se abre el formulario para cargar stock, precios o dar de alta un producto
          nuevo.
        </p>
      </div>

      <div className="flex rounded-xl border border-gray-200 bg-white p-1 shadow-sm mb-8 w-fit">
        <button
          type="button"
          onClick={() => {
            setModo('escaner')
            setMensaje(null)
          }}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
            modo === 'escaner' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <ScanBarcode size={20} />
          Lector / código
        </button>
        <button
          type="button"
          onClick={() => setModo('manual')}
          className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-colors ${
            modo === 'manual' ? 'bg-blue-600 text-white shadow' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Keyboard size={20} />
          Alta manual
        </button>
      </div>

      {mensaje && (
        <div
          className={`mb-6 flex items-start gap-3 rounded-lg p-4 ${
            mensaje.tipo === 'ok'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : mensaje.tipo === 'error'
                ? 'bg-red-50 text-red-800 border border-red-200'
                : mensaje.tipo === 'info'
                  ? 'bg-blue-50 text-blue-800 border border-blue-200'
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

      {modo === 'escaner' && (
        <div className="bg-white rounded-xl shadow border border-gray-100 p-8">
          <label htmlFor="scan-codigo" className="block text-sm font-medium text-gray-700 mb-2">
            Campo de captura (lector o teclado)
          </label>
          <input
            id="scan-codigo"
            ref={inputScanRef}
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Escanee o escriba el código y pulse Enter"
            value={scanValue}
            onChange={(e) => setScanValue(e.target.value)}
            onKeyDown={onScanKeyDown}
            disabled={showFormModal}
            className="w-full text-lg px-4 py-4 border-2 border-blue-200 rounded-xl focus:ring-2 focus:ring-brand-500 focus:border-blue-500 font-mono tracking-wide disabled:opacity-60"
          />
          <p className="text-sm text-gray-500 mt-3">
            Haga clic aquí antes de usar el lector si el foco está en otro control. Al escanear se abrirá el formulario
            para actualizar stock y precios (si ya existe) o cargar uno nuevo.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={showFormModal || !scanValue.trim()}
              onClick={() => procesarCodigo(scanValue)}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Buscar por código
            </button>
            <button
              type="button"
              onClick={limpiarEstadoScan}
              className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Limpiar
            </button>
          </div>
        </div>
      )}

      {modo === 'manual' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <div className="bg-gray-50 rounded-xl p-6 border border-gray-200 min-w-0">
            <ProductoModal
              key={codigoDesdeLista || 'nuevo-sugerido'}
              inline
              cargaProductos
              producto={null}
              codigoInicial={codigoDesdeLista}
              onClose={() => {}}
              onIngresoAutomatico={notificarIngresoGuardado}
            />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col min-h-[320px] max-h-[min(85vh,920px)] min-w-0">
            <div className="p-4 border-b border-gray-100 shrink-0">
              <h3 className="font-semibold text-gray-800 flex items-center gap-2 mb-3">
                <List size={20} className="text-brand-600" />
                Productos en la base
              </h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="search"
                  placeholder="Buscar por nombre o código…"
                  value={busquedaLista}
                  onChange={(e) => setBusquedaLista(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <button
                type="button"
                onClick={() => setCodigoDesdeLista('')}
                className="mt-3 text-sm text-brand-600 hover:text-brand-800 hover:underline"
              >
                Nuevo producto (código sugerido)
              </button>
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
                    const cod = p.codigo != null && String(p.codigo).trim() !== '' ? String(p.codigo).trim() : null
                    const seleccionado = cod != null && codigoDesdeLista === cod
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={!cod}
                          onClick={() => cod && setCodigoDesdeLista(cod)}
                          className={`w-full text-left rounded-lg px-3 py-2.5 transition-colors border ${
                            seleccionado
                              ? 'bg-blue-50 border-blue-200 ring-1 ring-blue-200'
                              : cod
                                ? 'border-transparent hover:bg-gray-50 hover:border-gray-100'
                                : 'border-transparent opacity-60 cursor-not-allowed'
                          }`}
                        >
                          <p className="font-medium text-gray-900 text-sm leading-snug">{p.nombre}</p>
                          <p className="text-xs font-mono text-gray-600 mt-0.5">
                            {cod || 'Sin código — no se puede elegir desde aquí'}
                          </p>
                          <p className="text-xs text-gray-400 mt-1">
                            Stock: {fmtCantidadStock(p.stock_actual ?? 0, p.unidad_medida)}
                            {p.fecha_vencimiento && !p.no_verifica_vencimiento && !p.no_controla_stock
                              ? ` · Vence ${fmtFechaCorta(p.fecha_vencimiento)}`
                              : ''}
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
      )}

      {showFormModal && (
        <ProductoModal
          key={codigoEscaneado}
          cargaProductos
          producto={null}
          codigoInicial={codigoEscaneado}
          onClose={cerrarFormModal}
          onSaved={notificarIngresoGuardado}
        />
      )}
    </div>
  )
}

export default CargaProductos
