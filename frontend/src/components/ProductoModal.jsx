import { useState, useEffect, useCallback } from 'react'
import { productosAPI, categoriasAPI, movimientosAPI } from '../services/api'
import { X } from 'lucide-react'
import {
  esUnidadKg,
  esUnidadLitro,
  esVentaPorMedidaDecimal,
  etiquetaPrecioUnidad,
  etiquetaCantidadUnidad
} from '../utils/unidades'
import { productoNoControlaStock, productoNoVerificaVencimiento, esNombreCafeMaquina } from '../utils/stockProducto'
import { fechaISOParaInput } from '../utils/fechas'

/** unidad | kg | litro | otra (caja, etc.) */
function tipoUnidadMedida(um) {
  if (esUnidadKg(um)) return 'kg'
  if (esUnidadLitro(um)) return 'litro'
  const u = String(um || '')
    .trim()
    .toLowerCase()
  if (u === 'unidad' || u === '') return 'unidad'
  return 'otra'
}

/** Cantidad en carga manual: string para permitir vacío y tipeo decimal (ej. 0,35). */
function cantidadIngresoANumero(s) {
  const t = String(s ?? '')
    .trim()
    .replace(',', '.')
  if (t === '' || t === '.') return 0
  const n = parseFloat(t)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function precioParaForm(n) {
  if (n == null || n === '') return ''
  const num = Number(n)
  if (!Number.isFinite(num) || num === 0) return ''
  return String(n)
}

function precioANumero(s) {
  const t = String(s ?? '')
    .trim()
    .replace(',', '.')
  if (t === '' || t === '.') return 0
  const n = parseFloat(t)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

const emptyForm = (codigo = '') => ({
  codigo,
  nombre: '',
  descripcion: '',
  categoria_id: '',
  precio_compra: '',
  precio_venta: '',
  stock_actual: 0,
  stock_minimo: 0,
  cantidad_ingreso: '',
  unidad_medida: 'unidad',
  no_controla_stock: false,
  no_verifica_vencimiento: false,
  fecha_vencimiento: ''
})

const ProductoModal = ({
  producto,
  onClose,
  codigoInicial = '',
  inline = false,
  onCodigoDuplicado,
  /** Tras registrar entrada automática por código duplicado (solo carga de productos) */
  onIngresoAutomatico,
  /** Tras guardar con éxito (modal / escáner) */
  onSaved,
  cargaProductos = false
}) => {
  const [formData, setFormData] = useState(() => emptyForm(codigoInicial))
  const [categorias, setCategorias] = useState([])
  const [loading, setLoading] = useState(false)
  /** Solo modo carga manual: stock según consulta a la API por código */
  const [stockEnBaseDatos, setStockEnBaseDatos] = useState(null)
  /** El código ya existe en BD: el nombre se toma y bloquea para no desfasar con el código */
  const [codigoExisteEnBd, setCodigoExisteEnBd] = useState(false)
  const [productoExistenteId, setProductoExistenteId] = useState(null)

  const reiniciarFormularioCarga = useCallback(async () => {
    if (!cargaProductos || producto) return
    if (codigoInicial?.trim()) {
      setFormData(emptyForm(codigoInicial))
    } else {
      try {
        const { data } = await productosAPI.getCodigoSugerido()
        setFormData(emptyForm(String(data.codigo)))
      } catch {
        setFormData(emptyForm(''))
      }
    }
    setStockEnBaseDatos(0)
    setCodigoExisteEnBd(false)
    setProductoExistenteId(null)
  }, [cargaProductos, producto, codigoInicial])

  useEffect(() => {
    loadCategorias()
    if (producto) {
      setFormData({
        codigo: producto.codigo || '',
        nombre: producto.nombre || '',
        descripcion: producto.descripcion || '',
        categoria_id: producto.categoria_id || '',
        precio_compra: precioParaForm(producto.precio_compra),
        precio_venta: precioParaForm(producto.precio_venta),
        stock_actual: producto.stock_actual || 0,
        stock_minimo: producto.stock_minimo || 0,
        cantidad_ingreso: '',
        unidad_medida: producto.unidad_medida || 'unidad',
        no_controla_stock: productoNoControlaStock(producto),
        no_verifica_vencimiento: productoNoVerificaVencimiento(producto) && !productoNoControlaStock(producto)
          ? true
          : Boolean(producto.no_verifica_vencimiento),
        fecha_vencimiento: fechaISOParaInput(producto.fecha_vencimiento)
      })
      setStockEnBaseDatos(null)
      setCodigoExisteEnBd(false)
      setProductoExistenteId(producto.id || null)
      return
    }
    if (!cargaProductos) {
      setFormData(emptyForm(codigoInicial || ''))
      setStockEnBaseDatos(null)
      setCodigoExisteEnBd(false)
      setProductoExistenteId(null)
      return
    }
    let cancelled = false
    ;(async () => {
      await reiniciarFormularioCarga()
      if (cancelled) return
    })()
    return () => {
      cancelled = true
    }
  }, [producto, codigoInicial, cargaProductos, reiniciarFormularioCarga])

  useEffect(() => {
    if (!cargaProductos || producto) return
    const c = formData.codigo?.trim()
    if (!c) {
      setStockEnBaseDatos(0)
      setCodigoExisteEnBd(false)
      setProductoExistenteId(null)
      return
    }
    let cancelled = false
    const codigoConsultado = c
    const t = setTimeout(async () => {
      setStockEnBaseDatos(null)
      try {
        const { data } = await productosAPI.getByCodigo(codigoConsultado)
        if (cancelled) return
        const codigoRespuesta = String(data.codigo ?? '').trim()
        if (codigoRespuesta !== codigoConsultado) return
        setStockEnBaseDatos(Number(data.stock_actual) ?? 0)
        setCodigoExisteEnBd(true)
        setProductoExistenteId(data.id)
        setFormData((prev) => {
          if (String(prev.codigo ?? '').trim() !== codigoConsultado) return prev
          return {
          ...prev,
          nombre: data.nombre || '',
          descripcion: data.descripcion || '',
          categoria_id: data.categoria_id != null && data.categoria_id !== '' ? String(data.categoria_id) : '',
          precio_compra: precioParaForm(data.precio_compra),
          precio_venta: precioParaForm(data.precio_venta),
          unidad_medida: data.unidad_medida || 'unidad',
          no_controla_stock: productoNoControlaStock(data),
          no_verifica_vencimiento: Boolean(data.no_verifica_vencimiento) || productoNoVerificaVencimiento(data),
          fecha_vencimiento: fechaISOParaInput(data.fecha_vencimiento),
          ...(productoNoControlaStock(data)
            ? { stock_actual: 0, stock_minimo: 0, cantidad_ingreso: '', fecha_vencimiento: '' }
            : {}),
          ...(productoNoVerificaVencimiento(data) ? { fecha_vencimiento: '' } : {})
        }
        })
      } catch (e) {
        if (cancelled) return
        if (e.response?.status === 404) {
          setStockEnBaseDatos(0)
          setCodigoExisteEnBd(false)
          setProductoExistenteId(null)
        } else {
          console.error(e)
          setStockEnBaseDatos(0)
          setCodigoExisteEnBd(false)
          setProductoExistenteId(null)
        }
      }
    }, 450)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [formData.codigo, cargaProductos, producto])

  const loadCategorias = async () => {
    try {
      const response = await categoriasAPI.getAll()
      setCategorias(response.data)
    } catch (error) {
      console.error('Error al cargar categorías:', error)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (tipoUnidadMedida(formData.unidad_medida) === 'otra' && !String(formData.unidad_medida || '').trim()) {
      alert('Escriba la unidad (ej. litro) o elija "Por pieza" / "Por peso — kg".')
      return
    }
    const pideVencimiento = !formData.no_controla_stock && !formData.no_verifica_vencimiento
    if (pideVencimiento && !fechaISOParaInput(formData.fecha_vencimiento)) {
      alert('La fecha de vencimiento es obligatoria, salvo que marques “No verifica vencimiento”.')
      return
    }
    setLoading(true)
    try {
      const precioCompra = precioANumero(formData.precio_compra)
      const precioVenta = precioANumero(formData.precio_venta)

      if (producto || (cargaProductos && productoExistenteId)) {
        const idEditar = producto?.id || productoExistenteId
        const noControla = Boolean(formData.no_controla_stock)
        const noVerifica = Boolean(formData.no_verifica_vencimiento)
        if (cargaProductos && !producto && productoExistenteId) {
          const qty = cantidadIngresoANumero(formData.cantidad_ingreso)
          if (qty > 0 && !noControla) {
            await movimientosAPI.create({
              producto_id: idEditar,
              tipo: 'entrada',
              cantidad: qty,
              motivo: 'Carga manual',
              usuario: 'Usuario'
            })
          }
          const { data: fresh } = await productosAPI.getById(idEditar)
          await productosAPI.update(idEditar, {
            codigo: fresh.codigo,
            nombre: (fresh.nombre || formData.nombre || '').trim(),
            descripcion: formData.descripcion?.trim() || null,
            categoria_id:
              formData.categoria_id === '' || formData.categoria_id == null
                ? null
                : Number(formData.categoria_id),
            precio_compra: precioCompra,
            precio_venta: precioVenta,
            stock_actual: Number(fresh.stock_actual) || 0,
            stock_minimo: Number(fresh.stock_minimo) || 0,
            unidad_medida: formData.unidad_medida || 'unidad',
            no_controla_stock: noControla,
            no_verifica_vencimiento: noVerifica,
            fecha_vencimiento: noControla || noVerifica ? null : fechaISOParaInput(formData.fecha_vencimiento) || null
          })
          if (inline) await reiniciarFormularioCarga()
          onIngresoAutomatico?.()
          onSaved?.()
          onClose()
          return
        }
        await productosAPI.update(idEditar, {
          ...formData,
          precio_compra: precioCompra,
          precio_venta: precioVenta,
          no_controla_stock: noControla,
          no_verifica_vencimiento: noVerifica,
          stock_actual: noControla ? 0 : Number(formData.stock_actual) || 0,
          stock_minimo: noControla ? 0 : Number(formData.stock_minimo) || 0,
          fecha_vencimiento: noControla || noVerifica ? null : fechaISOParaInput(formData.fecha_vencimiento) || null
        })
        onSaved?.()
      } else {
        const { cantidad_ingreso, ...rest } = formData
        const noControla = Boolean(formData.no_controla_stock)
        const noVerifica = Boolean(formData.no_verifica_vencimiento)
        const fechaVenc = noControla || noVerifica ? null : fechaISOParaInput(formData.fecha_vencimiento) || null
        const payload =
          cargaProductos
            ? {
                ...rest,
                precio_compra: precioCompra,
                precio_venta: precioVenta,
                no_controla_stock: noControla,
                no_verifica_vencimiento: noVerifica,
                stock_actual: noControla ? 0 : cantidadIngresoANumero(cantidad_ingreso),
                stock_minimo: 0,
                fecha_vencimiento: fechaVenc
              }
            : {
                ...formData,
                precio_compra: precioCompra,
                precio_venta: precioVenta,
                no_controla_stock: noControla,
                no_verifica_vencimiento: noVerifica,
                stock_actual: noControla ? 0 : Number(formData.stock_actual) || 0,
                stock_minimo: noControla ? 0 : Number(formData.stock_minimo) || 0,
                fecha_vencimiento: fechaVenc
              }
        await productosAPI.create(payload)
        if (inline) {
          if (cargaProductos) {
            await reiniciarFormularioCarga()
          } else {
            setFormData(emptyForm(codigoInicial))
          }
        } else {
          onSaved?.()
        }
      }
      onClose()
    } catch (error) {
      console.error('Error al guardar producto:', error)
      const errorMessage = error.response?.data?.error || 'Error al guardar el producto'
      const codigoTrim = formData.codigo?.trim()
      const esDuplicado =
        !producto &&
        codigoTrim &&
        /ya existe|este código/i.test(errorMessage)

      if (esDuplicado) {
        try {
          const { data } = await productosAPI.getByCodigo(codigoTrim)
          if (cargaProductos && !producto) {
            const qty = cantidadIngresoANumero(formData.cantidad_ingreso)
            if (qty > 0) {
              try {
                await movimientosAPI.create({
                  producto_id: data.id,
                  tipo: 'entrada',
                  cantidad: qty,
                  motivo: 'Carga manual',
                  usuario: 'Usuario'
                })
              } catch (ingErr) {
                alert(ingErr.response?.data?.error || 'No se pudo registrar la entrada de stock')
                return
              }
            }
            try {
              const { data: fresh } = await productosAPI.getById(data.id)
              await productosAPI.update(data.id, {
                codigo: fresh.codigo,
                nombre: (fresh.nombre || '').trim(),
                descripcion: formData.descripcion?.trim() || null,
                categoria_id:
                  formData.categoria_id === '' || formData.categoria_id == null
                    ? null
                    : Number(formData.categoria_id),
                precio_compra: precioANumero(formData.precio_compra),
                precio_venta: precioANumero(formData.precio_venta),
                stock_actual: Number(fresh.stock_actual) || 0,
                stock_minimo: Number(fresh.stock_minimo) || 0,
                unidad_medida: formData.unidad_medida || 'unidad',
                no_controla_stock: Boolean(fresh.no_controla_stock),
                no_verifica_vencimiento: Boolean(formData.no_verifica_vencimiento),
                fecha_vencimiento:
                  Boolean(fresh.no_controla_stock) || Boolean(formData.no_verifica_vencimiento)
                    ? null
                    : fechaISOParaInput(formData.fecha_vencimiento) || null
              })
            } catch (upErr) {
              alert(upErr.response?.data?.error || 'No se pudo actualizar precios y datos del producto')
              return
            }
            if (inline) {
              if (cargaProductos) {
                await reiniciarFormularioCarga()
              } else {
                setFormData(emptyForm(codigoInicial))
                setStockEnBaseDatos(0)
                setCodigoExisteEnBd(false)
              }
            }
            onIngresoAutomatico?.()
            onSaved?.()
            onClose()
            return
          }
          if (onCodigoDuplicado) {
            onCodigoDuplicado(data)
            if (inline && cargaProductos) {
              await reiniciarFormularioCarga()
            } else if (inline) {
              setFormData(emptyForm(codigoInicial))
            }
            return
          }
          alert(
            `Ya existe un producto con el código "${codigoTrim}" (${data.nombre}).\n\nPara sumar stock, use el botón «Registrar entrada de stock» en esta pantalla o la sección Movimientos.`
          )
        } catch (lookupErr) {
          alert(errorMessage)
        }
      } else {
        alert(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, checked } = e.target
    if (name === 'no_controla_stock') {
      setFormData((prev) => ({
        ...prev,
        no_controla_stock: checked,
        ...(checked ? { stock_actual: 0, stock_minimo: 0, cantidad_ingreso: '', fecha_vencimiento: '' } : {})
      }))
      return
    }
    if (name === 'no_verifica_vencimiento') {
      setFormData((prev) => ({
        ...prev,
        no_verifica_vencimiento: checked,
        ...(checked ? { fecha_vencimiento: '' } : {})
      }))
      return
    }
    if (name === 'cantidad_ingreso') {
      setFormData((prev) => {
        const dec = esVentaPorMedidaDecimal(prev.unidad_medida)
        if (dec) {
          const v = String(value).replace(',', '.')
          if (v === '' || /^\d*\.?\d*$/.test(v)) {
            return { ...prev, cantidad_ingreso: v }
          }
          return prev
        }
        if (value === '' || /^\d*$/.test(value)) {
          return { ...prev, cantidad_ingreso: value }
        }
        return prev
      })
      return
    }
    if (name === 'precio_compra' || name === 'precio_venta') {
      setFormData((prev) => {
        const v = String(value).replace(',', '.')
        if (v === '' || /^\d*\.?\d*$/.test(v)) {
          return { ...prev, [name]: v }
        }
        return prev
      })
      return
    }
    if (name === 'nombre') {
      setFormData((prev) => ({
        ...prev,
        nombre: value,
        ...(esNombreCafeMaquina(value) && !prev.no_controla_stock
          ? { no_controla_stock: true, stock_actual: 0, stock_minimo: 0, cantidad_ingreso: '' }
          : {})
      }))
      return
    }
    setFormData((prev) => ({
      ...prev,
      [name]:
        name.includes('stock')
          ? parseFloat(value) || 0
          : value
    }))
  }

  const handleCancel = async () => {
    if (inline) {
      if (cargaProductos) {
        await reiniciarFormularioCarga()
      } else {
        setFormData(emptyForm(codigoInicial))
      }
    }
    onClose()
  }

  const card = (
      <div className="modal-panel max-w-2xl">
        <div className="flex justify-between items-center p-4 sm:p-6 border-b">
          <h3 className="text-xl font-semibold text-gray-800">
            {producto
              ? 'Editar Producto'
              : inline
                ? 'Alta manual de producto'
                : cargaProductos
                  ? 'Cargar producto'
                  : 'Nuevo Producto'}
          </h3>
          {!inline && (
            <button type="button" onClick={handleCancel} className="text-gray-400 hover:text-gray-600">
              <X size={24} />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código</label>
              <input
                type="text"
                name="codigo"
                value={formData.codigo}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              {cargaProductos && !producto && (
                <p className="text-xs text-gray-500 mt-1">
                  Por defecto se propone el siguiente número libre entre los códigos numéricos. Podés cambiarlo para
                  cargar stock a un producto que ya exista.
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cómo se vende</label>
              <select
                value={tipoUnidadMedida(formData.unidad_medida)}
                onChange={(e) => {
                  const v = e.target.value
                  setFormData((prev) => {
                    if (v === 'kg') return { ...prev, unidad_medida: 'kg' }
                    if (v === 'litro') return { ...prev, unidad_medida: 'l' }
                    if (v === 'unidad') return { ...prev, unidad_medida: 'unidad' }
                    return {
                      ...prev,
                      unidad_medida:
                        tipoUnidadMedida(prev.unidad_medida) === 'otra' ? prev.unidad_medida : ''
                    }
                  })
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent bg-white"
              >
                <option value="unidad">Por pieza (unidad; cantidad entera en venta)</option>
                <option value="kg">Por peso — kg (precio $/kg; cantidad con decimales, ej. 0,35)</option>
                <option value="litro">Por litro — l (precio $/l; cantidad con decimales, ej. 0,25)</option>
                <option value="otra">Otra unidad (caja, pack…)…</option>
              </select>
              {tipoUnidadMedida(formData.unidad_medida) === 'otra' && (
                <input
                  type="text"
                  name="unidad_medida"
                  value={formData.unidad_medida}
                  onChange={handleChange}
                  placeholder="ej. caja, pack"
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              )}
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-2 py-1.5 mt-2">
                Use <strong>kg</strong> para productos que se pesan y <strong>l</strong> (por litro) para líquidos a granel;
                ambos permiten decimales en ventas. &quot;Otra unidad&quot; es para piezas enteras (caja, pack).
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              name="nombre"
              value={formData.nombre}
              onChange={handleChange}
              required
              readOnly={cargaProductos && !producto && codigoExisteEnBd}
              className={`w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
                cargaProductos && !producto && codigoExisteEnBd ? 'bg-gray-100 cursor-not-allowed text-gray-800' : ''
              }`}
            />
            {cargaProductos && !producto && codigoExisteEnBd && (
              <p className="text-xs text-gray-500 mt-1">
                Nombre tomado del producto ya registrado con este código (no editable para evitar inconsistencias).
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              name="descripcion"
              value={formData.descripcion}
              onChange={handleChange}
              rows="3"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <select
              name="categoria_id"
              value={formData.categoria_id}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="">Sin categoría</option>
              {categorias.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio de compra {etiquetaPrecioUnidad(formData.unidad_medida)}
              </label>
              <input
                type="text"
                inputMode="decimal"
                name="precio_compra"
                value={formData.precio_compra}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Precio de venta {etiquetaPrecioUnidad(formData.unidad_medida)}
              </label>
              <input
                type="text"
                inputMode="decimal"
                name="precio_venta"
                value={formData.precio_venta}
                onChange={handleChange}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>

          {cargaProductos && !producto ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock actual (en base de datos)
                </label>
                <input
                  type="text"
                  readOnly
                  value={
                    stockEnBaseDatos === null
                      ? 'Consultando…'
                      : `${stockEnBaseDatos} ${formData.unidad_medida || 'unidad'}`
                  }
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-800 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Se actualiza al escribir el código. Si el código es nuevo, muestra 0.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cantidad que ingresan {etiquetaCantidadUnidad(formData.unidad_medida)}
                </label>
                <input
                  type={esVentaPorMedidaDecimal(formData.unidad_medida) ? 'text' : 'number'}
                  inputMode={esVentaPorMedidaDecimal(formData.unidad_medida) ? 'decimal' : 'numeric'}
                  name="cantidad_ingreso"
                  value={formData.cantidad_ingreso}
                  onChange={handleChange}
                  disabled={Boolean(formData.no_controla_stock)}
                  min={esVentaPorMedidaDecimal(formData.unidad_medida) ? undefined : 0}
                  step={esVentaPorMedidaDecimal(formData.unidad_medida) ? undefined : 1}
                  placeholder={
                    esVentaPorMedidaDecimal(formData.unidad_medida)
                      ? 'ej. 0,35 o 1,2'
                      : undefined
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  {formData.no_controla_stock
                    ? 'Este producto no ingresa stock (elaborado).'
                    : esVentaPorMedidaDecimal(formData.unidad_medida)
                      ? 'Cantidad en kg o litros al guardar (stock inicial). Podés usar decimales con punto o coma. Si queda vacío, el stock inicial será 0.'
                      : 'Unidades que ingresan al guardar el producto (stock inicial). Si queda vacío, el stock inicial será 0.'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock actual {etiquetaCantidadUnidad(formData.unidad_medida)}
                </label>
                <input
                  type="number"
                  name="stock_actual"
                  min={0}
                  step={esVentaPorMedidaDecimal(formData.unidad_medida) ? '0.001' : '1'}
                  value={formData.stock_actual}
                  onChange={handleChange}
                  disabled={Boolean(formData.no_controla_stock)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Stock mínimo {etiquetaCantidadUnidad(formData.unidad_medida)}
                </label>
                <input
                  type="number"
                  name="stock_minimo"
                  min={0}
                  step={esVentaPorMedidaDecimal(formData.unidad_medida) ? '0.001' : '1'}
                  value={formData.stock_minimo}
                  onChange={handleChange}
                  disabled={Boolean(formData.no_controla_stock)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
                />
              </div>
            </div>
          )}

          {!formData.no_controla_stock && !formData.no_verifica_vencimiento && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de vencimiento *
              </label>
              <input
                type="date"
                name="fecha_vencimiento"
                value={fechaISOParaInput(formData.fecha_vencimiento)}
                onChange={handleChange}
                required
                className="w-full max-w-xs px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                Obligatoria para productos con control de stock. Se avisará una semana antes del vencimiento.
              </p>
            </div>
          )}

          <label className="flex items-start gap-3 rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-3 cursor-pointer dark:border-sky-500/40 dark:bg-sky-950/50">
            <input
              type="checkbox"
              name="no_verifica_vencimiento"
              checked={Boolean(formData.no_verifica_vencimiento)}
              onChange={handleChange}
              className="mt-0.5 rounded border-gray-300 text-sky-700 focus:ring-sky-500 dark:border-sky-400 dark:bg-slate-900"
            />
            <span className="text-sm text-gray-800 dark:text-sky-50">
              <span className="font-medium text-sky-900 dark:text-sky-100">No verifica vencimiento</span>
              <span className="block text-xs text-gray-600 mt-0.5 dark:text-sky-200/90">
                Para cigarrillos, limpieza y otros que no vencen: no pide fecha y no entra en la alerta de vencimiento.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/70 px-3 py-3 cursor-pointer dark:border-violet-500/40 dark:bg-violet-950/50">
            <input
              type="checkbox"
              name="no_controla_stock"
              checked={Boolean(formData.no_controla_stock)}
              onChange={handleChange}
              className="mt-0.5 rounded border-gray-300 text-violet-700 focus:ring-violet-500 dark:border-violet-400 dark:bg-slate-900"
            />
            <span className="text-sm text-gray-800 dark:text-violet-50">
              <span className="font-medium text-violet-900 dark:text-violet-100">No controla stock</span>
              <span className="block text-xs text-gray-600 mt-0.5 dark:text-violet-200/90">
                Para productos elaborados (ej. Café máquina): se puede vender sin stock y no se descuenta inventario.
                Sigue contando en ventas y en el rubro del cierre de caja.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            >
              {inline ? 'Limpiar formulario' : 'Cancelar'}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
  )

  if (inline) {
    return card
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      {card}
    </div>
  )
}

export default ProductoModal

