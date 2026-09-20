import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Eye, Minus, Plus, Package, Search, Send, Trash2, X } from 'lucide-react'
import { categoriasAPI, pedidosAPI, productosAPI } from '../services/api'
import CategoriaProductoSelect from '../components/CategoriaProductoSelect'
import {
  esVentaPorMedidaDecimal,
  fmtCantidadStock,
  redondearCantidad
} from '../utils/unidades'
import { esProductoSistema, productoNoControlaStock } from '../utils/stockProducto'

const valorOrden = (p, key) => {
  if (key === 'stock') {
    if (productoNoControlaStock(p)) return Number.NEGATIVE_INFINITY
    return Number(p.stock_actual) || 0
  }
  if (key === 'categoria') {
    return String(p.categoria_nombre || '').toLowerCase()
  }
  return String(p.nombre || '').toLowerCase()
}

const Pedidos = () => {
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [cantidades, setCantidades] = useState({})
  const [sortKey, setSortKey] = useState('nombre')
  const [sortDir, setSortDir] = useState('asc')
  const [enviando, setEnviando] = useState(false)
  const [mensaje, setMensaje] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [categorias, setCategorias] = useState([])
  const [manuales, setManuales] = useState([])
  const [manualNombre, setManualNombre] = useState('')
  const [manualCategoria, setManualCategoria] = useState('')
  const [manualCantidad, setManualCantidad] = useState(1)
  const [manualIdSeq, setManualIdSeq] = useState(1)

  useEffect(() => {
    const load = async () => {
      try {
        const [{ data: prods }, cats] = await Promise.all([
          productosAPI.getAll(),
          categoriasAPI.getAll().catch(() => ({ data: [] }))
        ])
        setProductos(Array.isArray(prods) ? prods.filter((p) => !esProductoSistema(p)) : [])
        setCategorias(Array.isArray(cats.data) ? cats.data : [])
      } catch (error) {
        console.error('Error al cargar productos:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const filtrados = useMemo(() => {
    const t = searchTerm.trim().toLowerCase()
    let lista = productos
    if (t) {
      lista = lista.filter(
        (p) =>
          p.nombre?.toLowerCase().includes(t) ||
          String(p.codigo || '')
            .toLowerCase()
            .includes(t) ||
          String(p.categoria_nombre || '')
            .toLowerCase()
            .includes(t)
      )
    }
    return [...lista].sort((a, b) => {
      const va = valorOrden(a, sortKey)
      const vb = valorOrden(b, sortKey)
      const cmp =
        typeof va === 'number' && typeof vb === 'number'
          ? va - vb
          : String(va).localeCompare(String(vb), 'es', { numeric: true, sensitivity: 'base' })
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [productos, searchTerm, sortKey, sortDir])

  const toggleOrden = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  const encabezadoOrden = (key, label, align = 'left', extraClass = '') => {
    const activo = sortKey === key
    const justify = align === 'right' ? 'justify-end text-right' : 'justify-start text-left'
    return (
      <th
        className={`px-3 sm:px-6 py-3 text-xs font-medium uppercase ${
          align === 'right' ? 'text-right' : 'text-left'
        } ${extraClass}`}
      >
        <button
          type="button"
          onClick={() => toggleOrden(key)}
          className={`inline-flex items-center gap-1 w-full ${justify} select-none ${
            activo
              ? 'text-brand-700 dark:text-brand-300'
              : 'text-gray-500 hover:text-gray-800 dark:text-slate-400 dark:hover:text-slate-100'
          }`}
          title={`Ordenar por ${label}`}
        >
          <span>{label}</span>
          {activo ? (
            sortDir === 'asc' ? (
              <ChevronUp size={14} className="shrink-0" />
            ) : (
              <ChevronDown size={14} className="shrink-0" />
            )
          ) : (
            <span className="inline-flex flex-col -space-y-1.5 opacity-40 shrink-0">
              <ChevronUp size={10} />
              <ChevronDown size={10} />
            </span>
          )}
        </button>
      </th>
    )
  }

  const cantidadDe = (p) => {
    const raw = cantidades[p.id]
    if (raw === undefined || raw === '') return 0
    const n = Number(raw)
    return Number.isFinite(n) ? n : 0
  }

  const setCantidad = (p, next) => {
    const decimal = esVentaPorMedidaDecimal(p.unidad_medida)
    let n = Number(next)
    if (!Number.isFinite(n) || n < 0) n = 0
    n = decimal ? redondearCantidad(n, 3) : Math.floor(n)
    setCantidades((prev) => ({ ...prev, [p.id]: n }))
  }

  const cambiar = (p, signo) => {
    const decimal = esVentaPorMedidaDecimal(p.unidad_medida)
    const paso = decimal ? 0.1 : 1
    setCantidad(p, cantidadDe(p) + signo * paso)
  }

  const agregarManual = (e) => {
    e?.preventDefault?.()
    const nombre = manualNombre.trim()
    const qty = Number(String(manualCantidad).replace(',', '.'))
    if (!nombre) {
      setMensaje({ tipo: 'error', texto: 'Escribí el nombre del producto nuevo.' })
      return
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setMensaje({ tipo: 'error', texto: 'La cantidad del producto nuevo tiene que ser mayor a 0.' })
      return
    }
    setManuales((prev) => [
      ...prev,
      {
        id: `m-${manualIdSeq}`,
        nombre,
        categoria_nombre: manualCategoria.trim(),
        cantidad: redondearCantidad(qty, 3)
      }
    ])
    setManualIdSeq((n) => n + 1)
    setManualNombre('')
    setManualCantidad(1)
    setMensaje(null)
  }

  const setCantidadManual = (id, next) => {
    let n = Number(String(next).replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) n = 0
    n = redondearCantidad(n, 3)
    if (n <= 0) {
      setManuales((prev) => prev.filter((m) => m.id !== id))
      return
    }
    setManuales((prev) => prev.map((m) => (m.id === id ? { ...m, cantidad: n } : m)))
  }

  const itemsPedido = useMemo(() => {
    const deCatalogo = productos
      .map((p) => ({ producto: p, cantidad: cantidadDe(p), manual: false }))
      .filter((it) => it.cantidad > 0)
    const deManual = manuales
      .filter((m) => Number(m.cantidad) > 0)
      .map((m) => ({
        producto: {
          id: m.id,
          nombre: m.nombre,
          categoria_nombre: m.categoria_nombre,
          unidad_medida: 'unidad'
        },
        cantidad: Number(m.cantidad),
        manual: true
      }))
    return [...deCatalogo, ...deManual]
  }, [productos, cantidades, manuales])

  const pedidoPorCategoria = useMemo(() => {
    const map = new Map()
    for (const it of itemsPedido) {
      const cat = String(it.producto.categoria_nombre || '').trim() || 'Sin categoría'
      if (!map.has(cat)) map.set(cat, [])
      map.get(cat).push(it)
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b, 'es', { sensitivity: 'base' }))
      .map(([categoria, items]) => ({
        categoria,
        items: items.slice().sort((x, y) =>
          String(x.producto.nombre || '').localeCompare(String(y.producto.nombre || ''), 'es', {
            sensitivity: 'base'
          })
        )
      }))
  }, [itemsPedido])

  useEffect(() => {
    if (!showPreview) return
    const onKey = (e) => {
      if (e.key === 'Escape' && !enviando) {
        e.preventDefault()
        setShowPreview(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showPreview, enviando])

  const enviarPedido = async () => {
    if (!itemsPedido.length || enviando) return
    setEnviando(true)
    setMensaje(null)
    try {
      const { data } = await pedidosAPI.enviar({
        items: itemsPedido.map((it) =>
          it.manual
            ? {
                manual: true,
                nombre: it.producto.nombre,
                categoria_nombre: it.producto.categoria_nombre,
                cantidad: it.cantidad
              }
            : { id: it.producto.id, cantidad: it.cantidad }
        )
      })
      setCantidades({})
      setManuales([])
      setShowPreview(false)
      setMensaje({
        tipo: 'ok',
        texto: `Pedido enviado a ${data.email_destino} (${data.productos} producto${
          data.productos === 1 ? '' : 's'
        }).`
      })
    } catch (error) {
      setMensaje({
        tipo: 'error',
        texto: error.response?.data?.error || 'No se pudo enviar el pedido.'
      })
    } finally {
      setEnviando(false)
    }
  }

  if (loading) {
    return <div className="text-center py-12">Cargando productos...</div>
  }

  return (
    <div className="w-full min-w-0 max-w-full">
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="page-title">Pedidos</h2>
          <p className="page-subtitle">
            Marcá la cantidad a pedir o agregá un producto que todavía no está cargado.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          disabled={!itemsPedido.length}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          <Eye size={16} />
          {itemsPedido.length
            ? `Vista previa (${itemsPedido.length})`
            : 'Vista previa'}
        </button>
      </div>

      {mensaje && (
        <div
          className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
            mensaje.tipo === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200'
          }`}
        >
          {mensaje.texto}
        </div>
      )}

      <div className="card p-4 mb-6">
        <p className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3">
          Producto nuevo (no está en el listado)
        </p>
        <form onSubmit={agregarManual} className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <input
            type="text"
            value={manualNombre}
            onChange={(e) => setManualNombre(e.target.value)}
            placeholder="Nombre del producto"
            className="md:col-span-5 px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-slate-800 dark:border-slate-600"
          />
          <select
            value={manualCategoria}
            onChange={(e) => setManualCategoria(e.target.value)}
            className="md:col-span-3 px-3 py-2 border border-gray-300 rounded-lg text-sm dark:bg-slate-800 dark:border-slate-600"
          >
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0.1"
            step="0.1"
            value={manualCantidad}
            onChange={(e) => setManualCantidad(e.target.value === '' ? '' : e.target.value)}
            placeholder="Cant."
            className="md:col-span-2 px-3 py-2 border border-gray-300 rounded-lg text-sm text-center tabular-nums dark:bg-slate-800 dark:border-slate-600"
          />
          <button
            type="submit"
            className="md:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-semibold hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
          >
            <Plus size={16} />
            Agregar
          </button>
        </form>
        {manuales.length > 0 && (
          <ul className="mt-4 divide-y divide-gray-100 dark:divide-slate-700 border-t border-gray-100 dark:border-slate-700 pt-3">
            {manuales.map((m) => (
              <li key={m.id} className="py-2 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-slate-100">
                    {m.nombre}
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded">
                      Nuevo
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">{m.categoria_nombre || 'Sin categoría'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCantidadManual(m.id, Number(m.cantidad) - 1)}
                    className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-slate-600"
                    aria-label={`Restar ${m.nombre}`}
                  >
                    <Minus size={16} />
                  </button>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={m.cantidad}
                    onChange={(e) => setCantidadManual(m.id, e.target.value)}
                    className="w-20 text-center py-1.5 border border-gray-300 rounded-lg text-sm tabular-nums dark:bg-slate-800 dark:border-slate-600"
                  />
                  <button
                    type="button"
                    onClick={() => setCantidadManual(m.id, Number(m.cantidad) + 1)}
                    className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-slate-600"
                    aria-label={`Sumar ${m.nombre}`}
                  >
                    <Plus size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setManuales((prev) => prev.filter((x) => x.id !== m.id))}
                    className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                    aria-label={`Quitar ${m.nombre}`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card p-4 mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
          <input
            type="search"
            placeholder="Buscar por nombre, código o categoría..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent dark:bg-slate-800 dark:border-slate-600"
          />
        </div>
      </div>

      {productos.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600 dark:text-slate-400">No hay productos registrados</p>
        </div>
      ) : filtrados.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600 dark:text-slate-400">No se encontraron productos</p>
        </div>
      ) : (
        <div className="card min-w-0 max-w-full overflow-hidden">
          <table className="w-full table-fixed">
              <thead className="bg-gray-50 dark:bg-slate-800">
                <tr>
                  {encabezadoOrden('nombre', 'Producto')}
                  {encabezadoOrden('categoria', 'Categorías', 'left', 'hidden md:table-cell w-44')}
                  {encabezadoOrden('stock', 'Stock', 'right', 'hidden sm:table-cell w-24')}
                  <th className="w-[7.25rem] sm:w-48 !px-1 sm:!px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase dark:text-slate-400">
                    <span className="sm:hidden">Pedir</span>
                    <span className="hidden sm:inline">Cantidad a pedir</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {filtrados.map((p) => {
                  const decimal = esVentaPorMedidaDecimal(p.unidad_medida)
                  const qty = cantidadDe(p)
                  const stockTxt = productoNoControlaStock(p)
                    ? 'Sin stock'
                    : fmtCantidadStock(p.stock_actual, p.unidad_medida)
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/70">
                      <td className="px-2.5 sm:px-6 py-2.5 sm:py-3 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-slate-100 break-words leading-snug">
                          {p.nombre}
                        </div>
                        {p.codigo && (
                          <div className="text-[11px] font-mono text-gray-500 dark:text-slate-400 truncate">
                            {p.codigo}
                          </div>
                        )}
                        <div className="sm:hidden text-[11px] text-gray-500 dark:text-slate-400 mt-0.5 tabular-nums">
                          Stock: {stockTxt}
                        </div>
                      </td>
                      <td className="px-3 sm:px-6 py-3 text-sm text-gray-600 dark:text-slate-300 hidden md:table-cell">
                        <CategoriaProductoSelect
                          productoId={p.id}
                          categoriaId={p.categoria_id}
                          categorias={categorias}
                          onSaved={(actualizado) =>
                            setProductos((prev) =>
                              prev.map((row) =>
                                row.id === actualizado.id ? { ...row, ...actualizado } : row
                              )
                            )
                          }
                          className="max-w-full w-full"
                        />
                      </td>
                      <td className="px-2 sm:px-6 py-3 whitespace-nowrap text-right text-sm tabular-nums hidden sm:table-cell">
                        {productoNoControlaStock(p) ? (
                          <span className="text-violet-700 dark:text-violet-300">Sin stock</span>
                        ) : (
                          <span className="text-gray-900 dark:text-slate-100">
                            {stockTxt}
                          </span>
                        )}
                      </td>
                      <td className="!px-1 sm:!px-6 py-2 sm:py-3">
                        <div className="flex items-center justify-center gap-0.5 sm:gap-2">
                          <button
                            type="button"
                            onClick={() => cambiar(p, -1)}
                            disabled={qty <= 0}
                            className="p-1 sm:p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed dark:border-slate-600 dark:hover:bg-slate-800"
                            aria-label={`Restar ${p.nombre}`}
                          >
                            <Minus size={14} />
                          </button>
                          <input
                            type="number"
                            min="0"
                            step={decimal ? '0.1' : '1'}
                            value={cantidades[p.id] === undefined ? 0 : cantidades[p.id]}
                            onChange={(e) => {
                              const raw = e.target.value
                              if (raw === '') {
                                setCantidades((prev) => ({ ...prev, [p.id]: '' }))
                                return
                              }
                              setCantidad(p, raw.replace(',', '.'))
                            }}
                            onBlur={() => {
                              if (cantidades[p.id] === '' || cantidades[p.id] === undefined) {
                                setCantidad(p, 0)
                              }
                            }}
                            className="w-11 sm:w-20 min-w-0 text-center py-1 sm:py-1.5 border border-gray-300 rounded-lg text-xs sm:text-sm tabular-nums dark:bg-slate-800 dark:border-slate-600"
                          />
                          <button
                            type="button"
                            onClick={() => cambiar(p, 1)}
                            className="p-1 sm:p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50 dark:border-slate-600 dark:hover:bg-slate-800"
                            aria-label={`Sumar ${p.nombre}`}
                          >
                            <Plus size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
        </div>
      )}

      {showPreview && (
        <div
          className="modal-scrim fixed inset-0 z-[90] flex items-center justify-center p-4"
          onClick={() => !enviando && setShowPreview(false)}
          role="presentation"
        >
          <div
            className="modal-panel max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pedido-preview-titulo"
          >
            <div className="px-5 py-4 border-b flex items-center justify-between gap-3 shrink-0">
              <div>
                <h3 id="pedido-preview-titulo" className="text-lg font-semibold text-gray-900">
                  Pedido
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  {itemsPedido.length} producto(s) · ordenado por categoría
                </p>
              </div>
              <button
                type="button"
                onClick={() => !enviando && setShowPreview(false)}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Cerrar"
                disabled={enviando}
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
              {pedidoPorCategoria.map(({ categoria, items }) => (
                <div key={categoria}>
                  <div className="flex items-center justify-between gap-2 rounded-lg bg-gray-100 px-3 py-2">
                    <p className="text-sm font-bold uppercase tracking-wide text-gray-800 text-center flex-1">
                      {categoria}
                    </p>
                    <span className="text-xs text-gray-500 shrink-0">{items.length} prod.</span>
                  </div>
                  <div className="mt-1 border-b border-gray-200 pb-1 flex justify-between text-xs font-semibold text-gray-500 uppercase">
                    <span>Producto</span>
                    <span>Cantidad</span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {items.map((it) => (
                      <li
                        key={it.producto.id}
                        className="py-2 flex items-start justify-between gap-4 text-sm"
                      >
                        <span className="text-gray-900 min-w-0">
                          {it.producto.nombre}
                          {it.manual && (
                            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-sky-800 bg-sky-100 px-1.5 py-0.5 rounded">
                              Nuevo
                            </span>
                          )}
                        </span>
                        <span className="tabular-nums text-gray-900 shrink-0">
                          {fmtCantidadStock(it.cantidad, it.producto.unidad_medida)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {mensaje?.tipo === 'error' && showPreview && (
              <div className="mx-5 mb-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800">
                {mensaje.texto}
              </div>
            )}

            <div className="px-5 py-4 border-t flex flex-col-reverse sm:flex-row sm:justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                disabled={enviando}
                className="px-4 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-gray-50 disabled:opacity-50"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={enviarPedido}
                disabled={!itemsPedido.length || enviando}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700 disabled:opacity-50"
              >
                <Send size={16} />
                {enviando ? 'Enviando…' : 'Enviar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Pedidos
