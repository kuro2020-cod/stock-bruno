import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { productosAPI, ventasAPI, promocionesAPI, incidenciasAPI, fiadosAPI, cajaAPI, cafeMaquinaAPI, mercadopagoAPI, retirosAPI } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useCarrito } from '../context/CarritoContext'
import InicioCajaModal from '../components/InicioCajaModal'
import VerificarTransferenciaMpModal from '../components/VerificarTransferenciaMpModal'
import CobrarQrMpModal from '../components/CobrarQrMpModal'
import CobrarVentaModal from '../components/CobrarVentaModal'
import ElegirPromoProductoModal from '../components/ElegirPromoProductoModal'
import {
  ShoppingCart,
  Search,
  ScanBarcode,
  Trash2,
  Plus,
  Minus,
  CheckCircle,
  Package,
  AlertCircle,
  AlertTriangle,
  Info,
  Coffee,
  RotateCcw,
  X,
  Tag
} from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  esUnidadKg,
  esUnidadLitro,
  esVentaPorMedidaDecimal,
  etiquetaPrecioUnidad,
  etiquetaCantidadUnidad,
  PASO_KG_VENTA,
  redondearCantidad,
  fmtCantidadStock
} from '../utils/unidades'
import { fmtMoney, promoVigente, textoIncluyeItemsPromo } from '../utils/promociones'
import { resolverPagosCombinados } from '../utils/pagosCombinados'
import {
  validarStockPromo,
  lineaCarritoPromoEmpaquetada,
  promoTieneItems,
  subtotalLineaPromo,
  itemsVentaDesdeCarrito,
  idLineaCarrito,
  maxUnidadesPromoEnCarrito,
  qtyStockProductoEnCarrito
} from '../utils/promocionVenta'
import { clienteFiadoDesdeCarrito, fiadoIdsDesdeCarrito, lineasCarritoDesdeFiados } from '../utils/fiadoCarrito'
import {
  productoNoControlaStock,
  MAX_CANTIDAD_SIN_STOCK,
  esNombreCafeMaquina
} from '../utils/stockProducto'

const METODOS_PAGO = [
  { key: 'efectivo', label: 'Efectivo' },
  { key: 'transferencia', label: 'Transferencia' },
  { key: 'tarjeta', label: 'Tarjeta' },
  { key: 'fiado', label: 'Fiado' }
]

const parseMontoPago = (s) => {
  const t = String(s ?? '')
    .trim()
    .replace(',', '.')
  if (t === '') return 0
  const n = parseFloat(t)
  return Number.isFinite(n) && n >= 0 ? n : NaN
}

const EPS = 1e-9

const numCantidadLinea = (q) => (q === '' || q === null || q === undefined ? 0 : Number(q))

/** Mientras se tipea 0.035, hay que conservar el texto (0 / 0. / 0.0 / 0.03…). */
const esCantidadDecimalEnEdicion = (raw) => {
  const s = String(raw ?? '')
    .trim()
    .replace(',', '.')
  if (s === '' || s === '.') return true
  if (!/^\d*\.?\d*$/.test(s)) return false
  if (s.endsWith('.')) return true
  const n = Number(s)
  if (!Number.isFinite(n)) return true
  // 0, 0.0, 0.00… o cualquier forma que el Number “achataría” (ceros a la derecha)
  if (n === 0) return true
  if (s.includes('.') && String(n) !== s) return true
  return false
}

const qtyForProduct = (cart, productoId) => qtyStockProductoEnCarrito(cart, productoId)

const maxCantidadParaLinea = (cart, line, producto) => {
  if (!producto) return numCantidadLinea(line.cantidad)
  if (productoNoControlaStock(producto)) return MAX_CANTIDAD_SIN_STOCK
  const otras = qtyForProduct(cart, line.producto_id) - numCantidadLinea(line.cantidad)
  return Math.max(0, redondearCantidad(Number(producto.stock_actual) - otras, 4))
}

const esCategoriaCigarrillos = (categoriaNombre) =>
  /cigarr/i.test(String(categoriaNombre || ''))

const esProductoRetornable = (producto) =>
  /retornable/i.test(String(producto?.nombre || ''))

const esProductoSistemaEnvase = (producto) => {
  const cod = String(producto?.codigo || '')
    .trim()
    .toUpperCase()
  const nom = String(producto?.nombre || '')
    .trim()
    .toUpperCase()
  return (
    cod === 'ENVASE' ||
    nom === 'ENVASE' ||
    cod === 'REINICIO-CAFE' ||
    cod === 'REINICIO-MILANESAS' ||
    cod === 'REINICIO-SANDWICH-MIL' ||
    cod === 'REINICIO-ROLLITOS-JQ' ||
    cod === 'REINICIO-CIGARRILLOS'
  )
}

/** Precio lista = 1 → solo se vende en caja (promo), no suelto. */
const esCigarrilloSoloCaja = (producto) => {
  if (!producto || !esCategoriaCigarrillos(producto.categoria_nombre)) return false
  return Math.abs(Number(producto.precio_venta) - 1) < 0.005
}

/** IDs de productos incluidos en una promo. */
const idsProductosEnPromo = (promo) => {
  const ids = new Set()
  for (const it of promo?.items || []) {
    if (it?.producto_id != null) ids.add(Number(it.producto_id))
  }
  if (promo?.producto_id != null) ids.add(Number(promo.producto_id))
  return ids
}

/** Promo de caja asociada a un producto (prioriza nombre/unidad con "caja"). */
const promoCajaParaProducto = (promocionesActivas, productoId) => {
  const pid = Number(productoId)
  if (!Number.isFinite(pid)) return null
  const candidatas = []
  for (const pr of promocionesActivas || []) {
    if (!promoTieneItems(pr)) continue
    if (idsProductosEnPromo(pr).has(pid)) candidatas.push(pr)
  }
  if (!candidatas.length) return null
  const conCaja = candidatas.find(
    (p) => /caja/i.test(String(p.nombre || '')) || /caja/i.test(String(p.unidad_promo || ''))
  )
  return conCaja || candidatas[0]
}

const promosParaProducto = (promocionesActivas, productoId) => {
  const pid = Number(productoId)
  if (!Number.isFinite(pid)) return []
  return (promocionesActivas || []).filter(
    (pr) => promoTieneItems(pr) && idsProductosEnPromo(pr).has(pid)
  )
}

const Ventas = () => {
  const { user } = useAuth()
  const { cart, setCart, restauradoDesdeStorage, marcarRestauracionVista } = useCarrito()
  const location = useLocation()
  const navigate = useNavigate()
  const esVendedorSolo = user?.rol === 'USER'
  const [productos, setProductos] = useState([])
  const [promocionesActivas, setPromocionesActivas] = useState([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sugerenciaIdx, setSugerenciaIdx] = useState(-1)
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [reiniciandoCafe, setReiniciandoCafe] = useState(false)
  /** Payload listo + monto transferencia: se confirma tras verificar MP / cobro QR. */
  const [verifTransferencia, setVerifTransferencia] = useState(null)
  /** Si hay POS configurado, usar cobro QR con monto; si no, modal de verificación manual. */
  const [mpQrCobroDisponible, setMpQrCobroDisponible] = useState(false)
  const [showCobrarModal, setShowCobrarModal] = useState(false)
  const [metodoPago, setMetodoPago] = useState('')
  const [pagoCombinado, setPagoCombinado] = useState(false)
  const [montosPago, setMontosPago] = useState(() => ({
    efectivo: '',
    transferencia: '',
    tarjeta: '',
    fiado: ''
  }))
  const [montoRecibidoEfectivo, setMontoRecibidoEfectivo] = useState('')
  const [clienteFiado, setClienteFiado] = useState('')
  const [clientesFiado, setClientesFiado] = useState([])
  const [mostrarSugerenciasFiado, setMostrarSugerenciasFiado] = useState(false)
  const [sugerenciaFiadoIdx, setSugerenciaFiadoIdx] = useState(-1)
  const [showConsultar, setShowConsultar] = useState(false)
  const [consultaTerm, setConsultaTerm] = useState('')
  const [productoConsultaSel, setProductoConsultaSel] = useState(null)
  /** Modal envase retornable: { producto, fase: 'pregunta'|'monto', monto } */
  const [envaseModal, setEnvaseModal] = useState(null)
  /** Modal suelto vs promoción al escanear/tildar un producto con promo. */
  const [promoChoiceModal, setPromoChoiceModal] = useState(null)
  /** Modal monto para crédito por entrega de envase (checkbox del carrito). */
  const [entregaEnvaseModal, setEntregaEnvaseModal] = useState(null)
  /** Inicio de caja obligatorio al entrar a Ventas. */
  const [cajaCheckDone, setCajaCheckDone] = useState(false)
  const [necesitaApertura, setNecesitaApertura] = useState(false)
  const [sugeridoCaja, setSugeridoCaja] = useState(null)
  const [abriendoCaja, setAbriendoCaja] = useState(false)
  const [toast, setToast] = useState(null)
  const searchRef = useRef(null)
  const sugerenciasListRef = useRef(null)
  const consultaRef = useRef(null)
  const showConsultarRef = useRef(false)
  const envaseModalRef = useRef(false)
  const promoChoiceModalRef = useRef(false)
  const entregaEnvaseModalRef = useRef(false)
  const inicioCajaModalRef = useRef(false)
  const cobrarModalRef = useRef(false)
  const toastTimeoutRef = useRef(null)
  /** Tras agregar al carrito, enfocar cantidad (kg/l) o volver al buscador (unidad). */
  const pendingCantidadProductoId = useRef(null)
  const pendingFocusSearch = useRef(false)
  /** Escaneo global: desactivar mientras el usuario edita cantidad/precio a mano. */
  const edicionManualRef = useRef(false)
  const scanBufferRef = useRef('')
  const scanLastKeyRef = useRef(0)
  const cantidadPrevRef = useRef(new Map())
  const tryAddByCodigoRef = useRef(async () => {})
  const tryAddByCodigoSeqRef = useRef(0)
  const setCantidadDirectRef = useRef(() => {})
  /** Ref al input de cantidad enfocado: { lineId, prev } o null. */
  const cantidadFocusRef = useRef(null)
  /** Timeout pendiente de devolver el foco al buscador (evita saltos al cambiar de campo). */
  const focusSearchTimeoutRef = useRef(null)

  const cancelPendingFocusSearch = useCallback(() => {
    if (focusSearchTimeoutRef.current) {
      clearTimeout(focusSearchTimeoutRef.current)
      focusSearchTimeoutRef.current = null
    }
  }, [])

  const focusSearch = useCallback(() => {
    cancelPendingFocusSearch()
    focusSearchTimeoutRef.current = setTimeout(() => {
      focusSearchTimeoutRef.current = null
      // No robar el foco si el usuario está en montos, fiado, cantidad, etc.
      if (edicionManualRef.current) return
      if (
        showConsultarRef.current ||
        envaseModalRef.current ||
        promoChoiceModalRef.current ||
        entregaEnvaseModalRef.current ||
        inicioCajaModalRef.current ||
        cobrarModalRef.current
      ) {
        return
      }
      const ae = document.activeElement
      if (ae && ae !== searchRef.current) {
        const tag = ae.tagName?.toLowerCase()
        if (tag === 'input' || tag === 'textarea' || tag === 'select' || ae.isContentEditable) {
          return
        }
      }
      searchRef.current?.focus()
    }, 80)
  }, [cancelPendingFocusSearch])

  const usuarioVenta = useMemo(() => {
    if (!user) return ''
    return [user.apellido, user.nombre].filter(Boolean).join(', ').trim() || user.usuario || ''
  }, [user])

  const showToast = useCallback((payload) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    setToast(payload)
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null)
      toastTimeoutRef.current = null
    }, 3000)
  }, [])

  useEffect(() => {
    if (!restauradoDesdeStorage || cart.length === 0) return
    showToast({
      type: 'msg',
      variant: 'info',
      message: `Se recuperó tu venta en curso (${cart.length} producto${cart.length === 1 ? '' : 's'})`
    })
    marcarRestauracionVista()
  }, [restauradoDesdeStorage, cart.length, showToast, marcarRestauracionVista])

  const reiniciarContadorCafe = useCallback(async () => {
    if (reiniciandoCafe) return
    let unidades = 0
    try {
      const { data } = await cafeMaquinaAPI.getResumen({ historialLimit: 1 })
      unidades = Number(data?.actual?.unidades || 0)
    } catch {
      /* si falla el preview, igual se puede reiniciar */
    }

    const ok = window.confirm(
      unidades > 0
        ? `¿Reiniciar el contador de café máquina?\n\nSe registrará en Movimientos que se vendieron ${unidades.toLocaleString('es-ES')} café(s) y el contador vuelve a 0.`
        : '¿Reiniciar el contador de café máquina?\n\nEl contador ya está en 0; se dejará igualmente el registro en Movimientos.'
    )
    if (!ok) return

    setReiniciandoCafe(true)
    try {
      const { data } = await cafeMaquinaAPI.reiniciar()
      const u = Number(data?.unidadesAntes || 0)
      showToast({
        type: 'msg',
        variant: 'info',
        message:
          u > 0
            ? `Contador café reiniciado. Se reportaron ${u.toLocaleString('es-ES')} venta(s) en Movimientos.`
            : 'Contador café reiniciado (estaba en 0). Registro creado en Movimientos.'
      })
    } catch (e) {
      showToast({
        type: 'msg',
        variant: 'error',
        message: e.response?.data?.error || 'No se pudo reiniciar el contador de café'
      })
    } finally {
      setReiniciandoCafe(false)
    }
  }, [reiniciandoCafe, showToast])

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
      if (focusSearchTimeoutRef.current) clearTimeout(focusSearchTimeoutRef.current)
    }
  }, [])

  useEffect(() => {
    envaseModalRef.current = Boolean(envaseModal)
    if (envaseModal) edicionManualRef.current = true
  }, [envaseModal])

  useEffect(() => {
    promoChoiceModalRef.current = Boolean(promoChoiceModal)
    if (promoChoiceModal) edicionManualRef.current = true
  }, [promoChoiceModal])

  useEffect(() => {
    entregaEnvaseModalRef.current = Boolean(entregaEnvaseModal)
    if (entregaEnvaseModal) edicionManualRef.current = true
  }, [entregaEnvaseModal])

  useEffect(() => {
    inicioCajaModalRef.current = Boolean(necesitaApertura)
    if (necesitaApertura) edicionManualRef.current = true
  }, [necesitaApertura])

  useEffect(() => {
    cobrarModalRef.current = showCobrarModal
    if (showCobrarModal) edicionManualRef.current = true
  }, [showCobrarModal])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await cajaAPI.getApertura()
        if (cancelled) return
        setNecesitaApertura(Boolean(data?.necesitaApertura))
        setSugeridoCaja(data?.sugerido ?? null)
      } catch (e) {
        console.error(e)
        if (!cancelled) {
          setNecesitaApertura(true)
          setSugeridoCaja(null)
          showToast({
            type: 'msg',
            variant: 'error',
            message: 'No se pudo verificar el inicio de caja'
          })
        }
      } finally {
        if (!cancelled) setCajaCheckDone(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showToast])

  const confirmarInicioCaja = useCallback(
    async (monto) => {
      setAbriendoCaja(true)
      try {
        await cajaAPI.abrir({ monto })
        setNecesitaApertura(false)
        showToast({
          type: 'msg',
          variant: 'info',
          message: `Inicio de caja registrado: ${fmtMoney(monto)}`
        })
        focusSearch()
      } catch (e) {
        showToast({
          type: 'msg',
          variant: 'error',
          message: e.response?.data?.error || 'No se pudo registrar el inicio de caja'
        })
      } finally {
        setAbriendoCaja(false)
      }
    },
    [focusSearch, showToast]
  )

  const loadProductos = useCallback(async () => {
    try {
      const { data } = await productosAPI.getAll()
      setProductos(data)
    } catch (e) {
      console.error(e)
      showToast({ type: 'msg', variant: 'error', message: 'No se pudieron cargar los productos' })
    } finally {
      setLoading(false)
    }
  }, [showToast])

  const loadPromociones = useCallback(async () => {
    try {
      const { data } = await promocionesAPI.getActivas()
      setPromocionesActivas(Array.isArray(data) ? data.filter(promoVigente) : [])
    } catch (e) {
      console.error(e)
    }
  }, [])

  useEffect(() => {
    loadProductos()
    loadPromociones()
  }, [loadProductos, loadPromociones])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await mercadopagoAPI.estado()
        if (!cancelled) setMpQrCobroDisponible(Boolean(data?.qr_cobro_configurado))
      } catch {
        if (!cancelled) setMpQrCobroDisponible(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /** Recargar catálogo si la pestaña estuvo abierta mucho tiempo (evita nombres viejos en memoria). */
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        loadProductos()
        loadPromociones()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [loadProductos, loadPromociones])

  /** Sincronizar nombres/códigos del carrito cuando se actualiza el catálogo en memoria. */
  useEffect(() => {
    if (!productos.length) return
    setCart((prev) => {
      let changed = false
      const next = prev.map((line) => {
        if (line.es_linea_promo || line.es_envase) return line
        const p = productos.find((x) => Number(x.id) === Number(line.producto_id))
        if (!p) return line
        const codigo = p.codigo ?? line.codigo
        if (line.nombre === p.nombre && line.codigo === codigo) return line
        changed = true
        return {
          ...line,
          nombre: p.nombre,
          codigo,
          unidad_medida: p.unidad_medida || line.unidad_medida
        }
      })
      return changed ? next : prev
    })
  }, [productos, setCart])

  useEffect(() => {
    if (!loading && cajaCheckDone && !necesitaApertura) focusSearch()
  }, [loading, cajaCheckDone, necesitaApertura, focusSearch])

  useEffect(() => {
    if (location.pathname === '/ventas' && !loading && cajaCheckDone && !necesitaApertura) {
      focusSearch()
    }
  }, [location.key, location.pathname, loading, cajaCheckDone, necesitaApertura, focusSearch])

  /** Producto incluido en alguna promo vigente (para badge en listado; la venta es por la promo). */
  const promoPorProducto = useMemo(() => {
    const m = new Map()
    for (const pr of promocionesActivas) {
      for (const it of pr.items || []) {
        m.set(Number(it.producto_id), pr)
      }
      if (pr.producto_id && !pr.items?.length) {
        m.set(Number(pr.producto_id), pr)
      }
    }
    return m
  }, [promocionesActivas])

  const productoEnvase = useMemo(
    () =>
      productos.find(
        (p) =>
          String(p.codigo || '')
            .trim()
            .toUpperCase() === 'ENVASE' ||
          String(p.nombre || '')
            .trim()
            .toUpperCase() === 'ENVASE'
      ) || null,
    [productos]
  )

  const precioParaProducto = useCallback((p) => Number(p.precio_venta) || 0, [])

  const aplicarPromocionAlCarrito = useCallback(
    (promo) => {
      if (!promoTieneItems(promo)) {
        showToast({ type: 'msg', variant: 'warn', message: 'La promoción no tiene productos configurados' })
        return
      }
      const errores = validarStockPromo(promo, productos, cart)
      if (errores.length) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: errores.length === 1 ? errores[0] : `Stock insuficiente: ${errores.join('; ')}`
        })
        return
      }

      const linea = lineaCarritoPromoEmpaquetada(promo, productos)
      if (!linea) return

      const existente = cart.find(
        (l) => l.es_linea_promo && Number(l.promo_id) === Number(promo.id)
      )
      const packs = (existente ? numCantidadLinea(existente.cantidad) : 0) + 1
      const sinEstaPromo = cart.filter(
        (l) => !(l.es_linea_promo && Number(l.promo_id) === Number(promo.id))
      )
      const max = maxUnidadesPromoEnCarrito(sinEstaPromo, linea, productos)
      if (packs > max) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: `No hay stock suficiente para "${promo.nombre}"`
        })
        return
      }

      setCart((prev) => {
        const sinPromo = prev.filter(
          (l) => !(l.es_linea_promo && Number(l.promo_id) === Number(promo.id))
        )
        pendingFocusSearch.current = true
        return [{ ...linea, cantidad: packs }, ...sinPromo]
      })

      showToast({
        type: 'msg',
        variant: 'info',
        message: `Promo "${promo.nombre}" agregada al carrito`
      })
      focusSearch()
    },
    [productos, cart, showToast, focusSearch]
  )

  /** Cigarrillos: aplicar/sumar promo CAJA (quita líneas sueltas del mismo producto). */
  const activarCajaCigarrillo = useCallback(
    (promo, { incrementar = false, silencioso = false } = {}) => {
      if (!promoTieneItems(promo)) {
        if (!silencioso) {
          showToast({ type: 'msg', variant: 'warn', message: 'La promoción de caja no tiene productos' })
        }
        return false
      }
      const ids = idsProductosEnPromo(promo)
      const lineaBase = lineaCarritoPromoEmpaquetada(promo, productos)
      if (!lineaBase) return false

      setCart((prev) => {
        const existente = prev.find(
          (l) => l.es_linea_promo && Number(l.promo_id) === Number(promo.id)
        )
        const cartSinSueltoNiPromo = prev.filter((l) => {
          if (l.es_linea_promo && Number(l.promo_id) === Number(promo.id)) return false
          if (!l.es_linea_promo && ids.has(Number(l.producto_id))) return false
          return true
        })
        const packsActuales = existente ? numCantidadLinea(existente.cantidad) : 0
        const packsNuevos = incrementar ? packsActuales + 1 : Math.max(1, packsActuales || 1)
        const max = maxUnidadesPromoEnCarrito(cartSinSueltoNiPromo, lineaBase, productos)
        if (packsNuevos > max + EPS) {
          if (!silencioso) {
            setTimeout(
              () =>
                showToast({
                  type: 'msg',
                  variant: 'warn',
                  message: 'Sin stock suficiente para la caja'
                }),
              0
            )
          }
          return prev
        }
        pendingFocusSearch.current = true
        if (!silencioso) {
          setTimeout(
            () =>
              showToast({
                type: 'msg',
                variant: 'info',
                message: `CAJA: ${promo.nombre} · ${fmtMoney(promo.precio_promocional)}`
              }),
            0
          )
        }
        return [{ ...lineaBase, cantidad: packsNuevos }, ...cartSinSueltoNiPromo]
      })
      return true
    },
    [productos, showToast]
  )

  /** Quitar CAJA: vuelve al producto suelto con cantidad = packs × unidades de la promo. */
  const desactivarCajaCigarrillo = useCallback(
    (linePromo, promo) => {
      const packs = Math.max(1, numCantidadLinea(linePromo.cantidad) || 1)
      const first =
        (promo?.items && promo.items[0]) ||
        (promo?.producto_id
          ? { producto_id: promo.producto_id, cantidad: Number(promo.cantidad_minima) || 1 }
          : null)
      if (!first?.producto_id) {
        setCart((prev) => prev.filter((l) => idLineaCarrito(l) !== idLineaCarrito(linePromo)))
        return
      }
      const p = productos.find((x) => Number(x.id) === Number(first.producto_id))
      if (!p) {
        setCart((prev) => prev.filter((l) => idLineaCarrito(l) !== idLineaCarrito(linePromo)))
        return
      }
      const qtyPorPack = Number(first.cantidad) || 1
      const cantidad = redondearCantidad(packs * qtyPorPack, 4)
      const maxLibre = productoNoControlaStock(p)
        ? MAX_CANTIDAD_SIN_STOCK
        : Math.max(0, redondearCantidad(Number(p.stock_actual), 4))
      const cantidadFinal = Math.min(cantidad, maxLibre)
      if (cantidadFinal + EPS < qtyPorPack && cantidadFinal <= EPS) {
        showToast({ type: 'msg', variant: 'warn', message: 'Sin stock para volver a suelto' })
        return
      }
      setCart((prev) => {
        const sin = prev.filter((l) => idLineaCarrito(l) !== idLineaCarrito(linePromo))
        return [
          {
            producto_id: p.id,
            nombre: p.nombre,
            codigo: p.codigo,
            unidad_medida: p.unidad_medida || 'unidad',
            precio_unitario: Number(p.precio_venta) || 0,
            cantidad: cantidadFinal > EPS ? cantidadFinal : 1,
            promo_nombre: promo?.nombre || null
          },
          ...sin
        ]
      })
    },
    [productos, showToast]
  )

  useEffect(() => {
    const id = location.state?.aplicarPromoId
    if (!id || loading || productos.length === 0) return

    let cancelled = false
    ;(async () => {
      let promo = promocionesActivas.find((p) => Number(p.id) === Number(id))
      if (!promo) {
        try {
          const { data } = await promocionesAPI.getById(id)
          promo = data
        } catch {
          if (!cancelled) {
            showToast({ type: 'msg', variant: 'error', message: 'No se encontró la promoción' })
          }
          return
        }
      }
      if (!cancelled && promo) {
        aplicarPromocionAlCarrito(promo)
      }
      navigate('/ventas', { replace: true, state: {} })
    })()

    return () => {
      cancelled = true
    }
  }, [
    location.state?.aplicarPromoId,
    loading,
    productos.length,
    promocionesActivas,
    aplicarPromocionAlCarrito,
    navigate,
    showToast
  ])

  useEffect(() => {
    const payload = location.state?.cobrarFiados
    if (!payload?.lineas?.length || loading) return

    setCart((prev) => {
      const idsFiado = new Set(
        payload.lineas.map((l) => l.fiado_id).filter((id) => id != null)
      )
      const sinFiadosReemplazados = prev.filter(
        (l) => !l.es_cobro_fiado || !idsFiado.has(l.fiado_id)
      )
      return [...sinFiadosReemplazados, ...payload.lineas]
    })

    showToast({
      type: 'msg',
      variant: 'info',
      message: payload.cliente
        ? `Fiado de ${payload.cliente} cargado en el carrito`
        : 'Fiado cargado en el carrito'
    })
    if (payload.cliente) {
      setClienteFiado(payload.cliente)
    }
    navigate('/ventas', { replace: true, state: {} })
  }, [location.state?.cobrarFiados, loading, navigate, showToast, setCart])

  useEffect(() => {
    if (showConsultar) {
      pendingFocusSearch.current = false
      pendingCantidadProductoId.current = null
      setTimeout(() => consultaRef.current?.focus(), 30)
      return
    }
    if (pendingFocusSearch.current) {
      pendingFocusSearch.current = false
      focusSearch()
      return
    }
    const id = pendingCantidadProductoId.current
    if (id === null || id === undefined) return
    pendingCantidadProductoId.current = null
    requestAnimationFrame(() => {
      const el = document.getElementById(`ventas-cantidad-${id}`)
      if (el) {
        el.focus()
        if (typeof el.select === 'function') el.select()
      }
    })
  }, [cart, focusSearch, showConsultar])

  /** Resultados de búsqueda: promociones vigentes + productos. */
  const filtered = useMemo(() => {
    const t = searchTerm.trim().toLowerCase()
    if (!t) return []

    const promos = (promocionesActivas || [])
      .filter((pr) => promoVigente(pr) && promoTieneItems(pr))
      .filter((pr) => {
        const nom = String(pr.nombre || '').toLowerCase()
        const desc = String(pr.descripcion || '').toLowerCase()
        const incluye = textoIncluyeItemsPromo(pr).toLowerCase()
        return nom.includes(t) || desc.includes(t) || incluye.includes(t)
      })
      .slice(0, 8)
      .map((pr) => ({
        kind: 'promo',
        key: `promo-${pr.id}`,
        promo: pr
      }))

    const prods = productos
      .filter((p) => !esProductoSistemaEnvase(p))
      .filter(
        (p) =>
          p.nombre?.toLowerCase().includes(t) ||
          String(p.codigo || '')
            .toLowerCase()
            .includes(t) ||
          String(p.id) === t
      )
      .slice(0, Math.max(4, 12 - promos.length))
      .map((p) => ({
        kind: 'producto',
        key: `prod-${p.id}`,
        producto: p
      }))

    return [...promos, ...prods].slice(0, 14)
  }, [productos, searchTerm, promocionesActivas])

  const sugerenciasVisibles = mostrarSugerencias && searchTerm.trim().length > 0 && filtered.length > 0

  const productosConsulta = useMemo(() => {
    const base = productos.filter((p) => !esProductoSistemaEnvase(p))
    const t = consultaTerm.trim().toLowerCase()
    if (!t) return base.slice(0, 80)
    return base
      .filter(
        (p) =>
          p.nombre?.toLowerCase().includes(t) ||
          String(p.codigo || '')
            .toLowerCase()
            .includes(t) ||
          String(p.id) === t
      )
      .slice(0, 80)
  }, [productos, consultaTerm])

  const abrirConsultar = () => {
    setShowConsultar(true)
    showConsultarRef.current = true
    setConsultaTerm('')
    setProductoConsultaSel(null)
    edicionManualRef.current = true
    setTimeout(() => consultaRef.current?.focus(), 80)
  }

  const cerrarConsultar = () => {
    setShowConsultar(false)
    showConsultarRef.current = false
    setConsultaTerm('')
    setProductoConsultaSel(null)
    edicionManualRef.current = false
    focusSearch()
  }

  const confirmarSeleccionConsulta = () => {
    if (!productoConsultaSel) return
    const p = productoConsultaSel
    cerrarConsultar()
    addToCart(p, { preguntarPromo: false })
  }

  const agregarProductoAlCarrito = (p) => {
    const esMedida = esVentaPorMedidaDecimal(p.unidad_medida)
    const paso = esMedida ? PASO_KG_VENTA : 1
    const sinStock = productoNoControlaStock(p)
    const stockDisp = sinStock ? MAX_CANTIDAD_SIN_STOCK : Number(p.stock_actual)
    const promo = promoPorProducto.get(Number(p.id))
    const precioLinea = precioParaProducto(p)

    setCart((prev) => {
      const totalActual = qtyForProduct(prev, p.id)
      if (!sinStock && totalActual + EPS >= stockDisp) {
        setTimeout(
          () =>
            showToast({
              type: 'msg',
              variant: 'warn',
              message: `Sin stock suficiente para "${p.nombre}" (disponible: ${fmtCantidadStock(stockDisp, p.unidad_medida)})`
            }),
          0
        )
        setTimeout(() => {
          if (showConsultarRef.current) consultaRef.current?.focus()
          else searchRef.current?.focus()
        }, 0)
        return prev
      }
      const idx = prev.findIndex((l) => l.producto_id === p.id && !l.es_linea_promo && !l.es_envase)
      if (idx >= 0) {
        const line = prev[idx]
        const max = maxCantidadParaLinea(prev, line, p)
        const base = esMedida
          ? numCantidadLinea(line.cantidad)
          : line.cantidad === '' || line.cantidad === null
            ? 0
            : Number(line.cantidad)
        const nueva = redondearCantidad(base + paso, 4)
        if (nueva > max + EPS) {
          setTimeout(() => {
            if (showConsultarRef.current) {
              consultaRef.current?.focus()
              return
            }
            const el = document.getElementById(`ventas-cantidad-${p.id}`)
            if (el) {
              el.focus()
              if (typeof el.select === 'function') el.select()
            }
          }, 0)
          return prev
        }
        // Re-sincronizar datos del producto (nombre/código) por si el catálogo en memoria estaba desactualizado
        const updated = {
          ...line,
          nombre: p.nombre,
          codigo: p.codigo ?? line.codigo,
          unidad_medida: p.unidad_medida || line.unidad_medida,
          promo_nombre: promo?.nombre ?? line.promo_nombre,
          cantidad: nueva,
          ...(esNombreCafeMaquina(p.nombre) ? { precio_unitario: precioLinea } : {})
        }
        const resto = [...prev.slice(0, idx), ...prev.slice(idx + 1)]
        if (esMedida) {
          pendingCantidadProductoId.current = idLineaCarrito(line)
        } else {
          pendingFocusSearch.current = true
        }
        return [updated, ...resto]
      }
      const primera = esMedida ? '' : 1
      if (esMedida) {
        pendingCantidadProductoId.current = p.id
      } else {
        pendingFocusSearch.current = true
      }
      return [
        {
          producto_id: p.id,
          nombre: p.nombre,
          codigo: p.codigo,
          unidad_medida: p.unidad_medida || 'unidad',
          precio_unitario: precioLinea,
          cantidad: primera,
          promo_nombre: promo?.nombre || null
        },
        ...prev
      ]
    })
    setSearchTerm('')
  }

  const agregarLineaEnvase = (productoOrigen, monto) => {
    const precio = Math.round(Number(monto) * 100) / 100
    if (!Number.isFinite(precio) || precio <= 0) {
      showToast({ type: 'msg', variant: 'warn', message: 'Ingrese un monto válido para el envase' })
      return false
    }
    if (!productoEnvase?.id) {
      showToast({
        type: 'msg',
        variant: 'error',
        message: 'No está cargado el producto ENVASE. Reiniciá el servidor o crealo en Productos.'
      })
      return false
    }
    setCart((prev) => [
      {
        line_key: `envase-${productoOrigen.id}-${Date.now()}`,
        producto_id: productoEnvase.id,
        nombre: 'ENVASE',
        codigo: productoEnvase.codigo || 'ENVASE',
        unidad_medida: 'unidad',
        precio_unitario: precio,
        cantidad: 1,
        es_envase: true,
        envase_de_producto_id: productoOrigen.id,
        envase_de_nombre: productoOrigen.nombre
      },
      ...prev
    ])
    return true
  }

  /** Crédito: descuenta del total de la venta (precio negativo). */
  const agregarLineaEnvaseEntrega = (monto) => {
    const precioAbs = Math.round(Number(monto) * 100) / 100
    if (!Number.isFinite(precioAbs) || precioAbs <= 0) {
      showToast({ type: 'msg', variant: 'warn', message: 'Ingrese un monto válido para el envase' })
      return false
    }
    if (!productoEnvase?.id) {
      showToast({
        type: 'msg',
        variant: 'error',
        message: 'No está cargado el producto ENVASE. Reiniciá el servidor o crealo en Productos.'
      })
      return false
    }
    setCart((prev) => [
      {
        line_key: `envase-entrega-${Date.now()}`,
        producto_id: productoEnvase.id,
        nombre: 'ENVASE (devolución)',
        codigo: productoEnvase.codigo || 'ENVASE',
        unidad_medida: 'unidad',
        precio_unitario: -precioAbs,
        cantidad: 1,
        es_envase: true,
        es_envase_entrega: true
      },
      ...prev.filter((l) => !l.es_envase_entrega)
    ])
    return true
  }

  const tieneEntregaEnvase = useMemo(
    () => cart.some((l) => l.es_envase_entrega),
    [cart]
  )

  const cerrarEntregaEnvaseModal = () => {
    setEntregaEnvaseModal(null)
    edicionManualRef.current = false
    focusSearch()
  }

  const confirmarEntregaEnvaseMonto = () => {
    const raw = String(entregaEnvaseModal?.monto || '')
      .trim()
      .replace(',', '.')
    const monto = parseFloat(raw)
    if (!Number.isFinite(monto) || monto <= 0) {
      showToast({
        type: 'msg',
        variant: 'warn',
        message: 'Ingrese el monto a descontar por devolución de envase'
      })
      return
    }
    if (!agregarLineaEnvaseEntrega(monto)) return
    showToast({
      type: 'msg',
      variant: 'info',
      message: `Devuelve envase: −${fmtMoney(monto)}`
    })
    cerrarEntregaEnvaseModal()
  }

  const onToggleEntregaEnvase = (checked) => {
    if (checked) {
      setEntregaEnvaseModal({ monto: '' })
      return
    }
    setEntregaEnvaseModal(null)
    setCart((prev) => prev.filter((l) => !l.es_envase_entrega))
  }

  const resolverProductoParaVenta = useCallback(
    async (p) => {
      if (!p?.id) return p
      try {
        const { data } = await productosAPI.getById(p.id)
        const local = productos.find((x) => Number(x.id) === Number(p.id))
        return local ? { ...local, ...data } : data
      } catch {
        const local = productos.find((x) => Number(x.id) === Number(p.id))
        return local ? { ...local, ...p } : p
      }
    },
    [productos]
  )

  const addToCart = async (p, { preguntarPromo = true } = {}) => {
    const productoFull = await resolverProductoParaVenta(p)
    // Cigarrillos con precio 1: solo caja → cargar promo directo
    if (esCigarrilloSoloCaja(productoFull)) {
      const promoCaja = promoCajaParaProducto(promocionesActivas, productoFull.id)
      if (!promoCaja) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: `"${productoFull.nombre}" es solo caja: configurá una promoción activa vinculada a este producto.`
        })
        return
      }
      activarCajaCigarrillo(promoCaja, { incrementar: true })
      setSearchTerm('')
      return
    }

    if (preguntarPromo) {
      const promosAsociadas = promosParaProducto(promocionesActivas, productoFull.id)
      if (promosAsociadas.length > 0) {
        setPromoChoiceModal({ producto: productoFull, promos: promosAsociadas })
        setSearchTerm('')
        return
      }
    }

    if (esProductoRetornable(productoFull)) {
      setEnvaseModal({ producto: productoFull, fase: 'pregunta', monto: '' })
      setSearchTerm('')
      return
    }

    agregarProductoAlCarrito(productoFull)
  }

  const cerrarPromoChoiceModal = () => {
    setPromoChoiceModal(null)
    edicionManualRef.current = false
    focusSearch()
  }

  const confirmarPromoChoiceSuelto = () => {
    const producto = promoChoiceModal?.producto
    setPromoChoiceModal(null)
    if (!producto) return
    if (esProductoRetornable(producto)) {
      setEnvaseModal({ producto, fase: 'pregunta', monto: '' })
      return
    }
    agregarProductoAlCarrito(producto)
    focusSearch()
  }

  const confirmarPromoChoicePromo = (promo) => {
    const producto = promoChoiceModal?.producto
    setPromoChoiceModal(null)
    if (!promo) return
    if (producto && esCategoriaCigarrillos(producto.categoria_nombre)) {
      activarCajaCigarrillo(promo, { incrementar: true })
    } else {
      aplicarPromocionAlCarrito(promo)
    }
    setSearchTerm('')
    edicionManualRef.current = false
    focusSearch()
  }

  const cerrarEnvaseModal = () => {
    setEnvaseModal(null)
    edicionManualRef.current = false
    focusSearch()
  }

  const confirmarEnvaseSi = () => {
    if (!envaseModal?.producto) return
    agregarProductoAlCarrito(envaseModal.producto)
    cerrarEnvaseModal()
  }

  const confirmarEnvaseNo = () => {
    setEnvaseModal((prev) => (prev ? { ...prev, fase: 'monto', monto: prev.monto || '' } : null))
  }

  const confirmarEnvaseMonto = () => {
    if (!envaseModal?.producto) return
    const raw = String(envaseModal.monto || '')
      .trim()
      .replace(',', '.')
    const monto = parseFloat(raw)
    if (!Number.isFinite(monto) || monto <= 0) {
      showToast({ type: 'msg', variant: 'warn', message: 'Ingrese el monto a cobrar por el envase' })
      return
    }
    agregarProductoAlCarrito(envaseModal.producto)
    if (!agregarLineaEnvase(envaseModal.producto, monto)) return
    showToast({
      type: 'msg',
      variant: 'info',
      message: `Envase agregado: ${fmtMoney(monto)}`
    })
    cerrarEnvaseModal()
  }

  const tryAddByCodigo = async (codigoRaw) => {
    const codigo = String(codigoRaw).trim()
    if (!codigo) return

    const seq = ++tryAddByCodigoSeqRef.current
    try {
      const { data } = await productosAPI.getByCodigo(codigo)
      if (seq !== tryAddByCodigoSeqRef.current) return
      if (String(data.codigo ?? '').trim() !== codigo) return
      addToCart(data)
    } catch (e) {
      if (seq !== tryAddByCodigoSeqRef.current) return
      if (e.response?.status === 404) {
        const exact = productos.filter(
          (p) =>
            String(p.codigo || '').toLowerCase() === codigo.toLowerCase() || String(p.id) === codigo
        )
        if (exact.length === 1) {
          addToCart(exact[0])
          return
        }
        const t = codigo.toLowerCase()
        const one = productos.filter(
          (p) => p.nombre?.toLowerCase() === t || String(p.codigo || '').toLowerCase() === t
        )
        if (one.length === 1) {
          addToCart(one[0])
          return
        }
        showToast({ type: 'msg', variant: 'warn', message: 'No hay producto con ese código.' })
      } else {
        showToast({
          type: 'msg',
          variant: 'error',
          message: e.response?.data?.error || 'Error al buscar el producto'
        })
      }
    }
  }

  tryAddByCodigoRef.current = tryAddByCodigo

  useEffect(() => {
    if (sugerenciaIdx < 0 || !sugerenciasListRef.current) return
    const el = sugerenciasListRef.current.querySelector(
      `[data-sugerencia-idx="${sugerenciaIdx}"]`
    )
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' })
    }
  }, [sugerenciaIdx])

  const marcarEdicionManual = () => {
    edicionManualRef.current = true
    cancelPendingFocusSearch()
  }

  const liberarEdicionManual = () => {
    edicionManualRef.current = false
    focusSearch()
  }

  const onSearchKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      if (!sugerenciasVisibles) return
      e.preventDefault()
      setSugerenciaIdx((i) => (i < filtered.length - 1 ? i + 1 : 0))
      return
    }
    if (e.key === 'ArrowUp') {
      if (!sugerenciasVisibles) return
      e.preventDefault()
      setSugerenciaIdx((i) => (i <= 0 ? filtered.length - 1 : i - 1))
      return
    }
    if (e.key === 'Escape') {
      setMostrarSugerencias(false)
      setSugerenciaIdx(-1)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const q = searchTerm.trim()
      if (!q) return

      const elegirItem = (item, { preguntarPromo = true } = {}) => {
        if (!item) return
        if (item.kind === 'promo') {
          aplicarPromocionAlCarrito(item.promo)
          setSearchTerm('')
        } else {
          addToCart(item.producto, { preguntarPromo })
        }
        setMostrarSugerencias(false)
        setSugerenciaIdx(-1)
      }

      if (sugerenciasVisibles && sugerenciaIdx >= 0 && filtered[sugerenciaIdx]) {
        elegirItem(filtered[sugerenciaIdx], { preguntarPromo: false })
        return
      }
      if (filtered.length === 1) {
        elegirItem(filtered[0])
        return
      }

      const productosFiltrados = filtered.filter((i) => i.kind === 'producto')
      const t = q.toLowerCase()
      const exactNom = productosFiltrados.filter((i) => i.producto.nombre?.toLowerCase() === t)
      if (exactNom.length === 1) {
        elegirItem(exactNom[0])
        return
      }
      const exactCod = productosFiltrados.filter(
        (i) => String(i.producto.codigo || '').toLowerCase() === t
      )
      if (exactCod.length === 1) {
        elegirItem(exactCod[0])
        return
      }
      const startsNom = productosFiltrados.filter((i) =>
        i.producto.nombre?.toLowerCase().startsWith(t)
      )
      if (startsNom.length === 1) {
        elegirItem(startsNom[0])
        return
      }

      setMostrarSugerencias(false)
      setSugerenciaIdx(-1)
      tryAddByCodigo(q)
    }
  }

  const updateCantidad = (lineId, sign) => {
    const line = cart.find((l) => idLineaCarrito(l) === lineId)
    if (!line) return

    if (line.es_linea_promo) {
      const base = numCantidadLinea(line.cantidad) || 0
      const next = Math.max(0, base + sign)
      if (next < 1) registrarIncidenciaCarrito('linea', [line])
    } else {
      const p = productos.find((x) => x.id === line.producto_id)
      const paso = p && esVentaPorMedidaDecimal(p.unidad_medida) ? PASO_KG_VENTA : 1
      const delta = sign * paso
      const esKg = p && esVentaPorMedidaDecimal(p.unidad_medida)
      const minQ = esKg ? 0.001 : 1
      let base = Number(line.cantidad)
      if (esKg && (line.cantidad === '' || Number.isNaN(base))) base = 0
      if (!esKg && (line.cantidad === '' || line.cantidad === null || Number.isNaN(base))) base = 0
      const next = redondearCantidad(base + delta, 4)
      const elimina =
        (esKg && line.cantidad === '' && delta < 0) ||
        (!esKg && (line.cantidad === '' || line.cantidad === null) && delta < 0) ||
        next < minQ - EPS
      if (elimina) registrarIncidenciaCarrito('linea', [line])
    }

    setCart((prev) => {
      const current = prev.find((l) => idLineaCarrito(l) === lineId)
      if (!current) return prev
      if (current.es_linea_promo) {
        const max = maxUnidadesPromoEnCarrito(prev, current, productos, lineId)
        const base = numCantidadLinea(current.cantidad) || 0
        const next = Math.max(0, base + sign)
        if (next < 1) return prev.filter((l) => idLineaCarrito(l) !== lineId)
        if (next > max) return prev
        return prev.map((l) => (idLineaCarrito(l) === lineId ? { ...l, cantidad: next } : l))
      }
      const p = productos.find((x) => x.id === current.producto_id)
      const paso = p && esVentaPorMedidaDecimal(p.unidad_medida) ? PASO_KG_VENTA : 1
      const delta = sign * paso
      const esKg = p && esVentaPorMedidaDecimal(p.unidad_medida)
      return prev
        .map((l) => {
          if (idLineaCarrito(l) !== lineId) return l
          const max = maxCantidadParaLinea(prev, l, p)
          const minQ = esKg ? 0.001 : 1
          if (esKg && l.cantidad === '' && delta < 0) return null
          if (!esKg && (l.cantidad === '' || l.cantidad === null) && delta < 0) return null
          let base = Number(l.cantidad)
          if (esKg && (l.cantidad === '' || Number.isNaN(base))) base = 0
          if (!esKg && (l.cantidad === '' || l.cantidad === null || Number.isNaN(base))) base = 0
          let next = redondearCantidad(base + delta, 4)
          if (next < minQ - EPS) return null
          if (next > max + EPS) next = max
          return { ...l, cantidad: next }
        })
        .filter(Boolean)
    })
  }

  const setCantidadDirect = (lineId, value) => {
    const line = cart.find((l) => idLineaCarrito(l) === lineId)
    if (line) {
      const raw = String(value).trim().replace(',', '.')
      let elimina = false
      if (line.es_linea_promo) {
        elimina = raw === '' || Number(value) <= 0 || Number.isNaN(Math.floor(Number(value)))
      } else {
        const p = productos.find((x) => x.id === line.producto_id)
        const esKg = p && esVentaPorMedidaDecimal(p.unidad_medida)
        if (!esKg) {
          const n = Math.floor(Number(value))
          elimina = raw === '' || Number(value) <= 0 || Number.isNaN(n) || n < 1
        } else if (raw !== '' && !esCantidadDecimalEnEdicion(raw)) {
          const parsed = parseFloat(raw)
          elimina = Number.isNaN(parsed) || parsed <= 0
        }
      }
      if (elimina) registrarIncidenciaCarrito('linea', [line])
    }

    setCart((prev) =>
      prev
        .map((row) => {
          if (idLineaCarrito(row) !== lineId) return row
          if (row.es_linea_promo) {
            const max = maxUnidadesPromoEnCarrito(prev, row, productos, lineId)
            const raw = String(value).trim()
            if (raw === '' || Number(value) <= 0) return null
            const n = Math.max(1, Math.floor(Number(value)))
            if (Number.isNaN(n)) return null
            return { ...row, cantidad: Math.min(n, max) }
          }
          const p = productos.find((x) => x.id === row.producto_id)
          const max = maxCantidadParaLinea(prev, row, p)
          const esKg = p && esVentaPorMedidaDecimal(p.unidad_medida)
          if (!esKg) {
            const raw = String(value).trim()
            if (raw === '' || Number(value) <= 0) return null
            const n = Math.floor(Number(value))
            if (Number.isNaN(n) || n < 1) return null
            return { ...row, cantidad: Math.min(n, max) }
          }
          // kg/l: conservar el texto mientras se escribe (ej. 0.035)
          const raw = String(value).trim().replace(',', '.')
          if (raw === '') {
            return { ...row, cantidad: '' }
          }
          if (!/^\d*\.?\d*$/.test(raw)) {
            return row
          }
          const texto = raw.startsWith('.') ? `0${raw}` : raw
          if (esCantidadDecimalEnEdicion(texto)) {
            return { ...row, cantidad: texto }
          }
          const parsed = parseFloat(texto)
          if (Number.isNaN(parsed) || parsed < 0) return row
          if (parsed === 0) {
            return { ...row, cantidad: texto }
          }
          let n = redondearCantidad(parsed, 4)
          if (n > 0 && n < 0.001) n = 0.001
          return { ...row, cantidad: Math.min(n, max) }
        })
        .filter(Boolean)
    )
  }

  setCantidadDirectRef.current = setCantidadDirect

  /**
   * Lector USB global. Detecta el escaneo por la velocidad entre teclas (ráfaga rápida)
   * y funciona en cualquier parte, incluso con el foco en el input de cantidad:
   * en ese caso se descarta lo que el escáner tipeó y se agrega el producto.
   */
  useEffect(() => {
    if (loading) return

    const SCAN_GAP_MS = 40 // tiempo máximo entre teclas de un escáner USB
    const MIN_CODE_LEN = 4

    const onKeyDown = (e) => {
      if (document.activeElement === searchRef.current) return
      // Modales / consulta: no capturar teclas (monto envase, búsqueda consultar, etc.)
      if (
        showConsultarRef.current ||
        envaseModalRef.current ||
        promoChoiceModalRef.current ||
        entregaEnvaseModalRef.current ||
        inicioCajaModalRef.current ||
        cobrarModalRef.current
      ) {
        return
      }

      const ae = document.activeElement
      const tag = ae?.tagName?.toLowerCase()
      if (tag === 'select' || tag === 'textarea') return

      const enCantidad = !!cantidadFocusRef.current
      // Fuera de cantidad: si hay edición manual (precio/pago) no interceptamos.
      if (!enCantidad && edicionManualRef.current) return
      // Cualquier otro input (monto, etc.): dejar escribir con normalidad.
      if (!enCantidad && tag === 'input' && ae !== searchRef.current) return

      const now = Date.now()
      const gap = now - scanLastKeyRef.current
      if (gap > SCAN_GAP_MS) {
        scanBufferRef.current = ''
      }
      scanLastKeyRef.current = now

      if (e.key === 'Enter') {
        const code = scanBufferRef.current.trim()
        const rafaga = scanBufferRef.current.length
        scanBufferRef.current = ''
        // Solo es escaneo si se acumularon varias teclas en ráfaga rápida.
        const esEscaneo = rafaga >= MIN_CODE_LEN && /^\d+$/.test(code)
        if (esEscaneo) {
          e.preventDefault()
          e.stopPropagation()
          if (enCantidad) {
            const { lineId, prev } = cantidadFocusRef.current
            setCantidadDirectRef.current(lineId, prev ?? 1)
          }
          setSearchTerm('')
          tryAddByCodigoRef.current(code)
          focusSearch()
        }
        // Si no es escaneo y estamos en cantidad, dejamos que el Enter siga normal.
        return
      }

      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return

      // Ráfaga rápida de dígitos: es un escáner. Bloqueamos que se escriba en el input.
      const esRafagaEscaner = gap <= SCAN_GAP_MS && /\d/.test(e.key)

      if (enCantidad) {
        if (/\d/.test(e.key)) {
          // Acumulamos todos los dígitos. Si es ráfaga de escáner, además bloqueamos la escritura.
          scanBufferRef.current += e.key
          if (esRafagaEscaner) {
            e.preventDefault()
            e.stopPropagation()
          }
        } else {
          // Tecla no numérica escrita a mano: reiniciamos el buffer.
          scanBufferRef.current = ''
        }
        return
      }

      // Fuera de cantidad: acumulamos y bloqueamos siempre (comportamiento clásico).
      e.preventDefault()
      e.stopPropagation()
      scanBufferRef.current += e.key
    }

    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [loading, focusSearch])

  const marcarEdicionCantidad = (lineId, cantidadActual) => {
    edicionManualRef.current = true
    cancelPendingFocusSearch()
    cantidadPrevRef.current.set(lineId, cantidadActual)
    cantidadFocusRef.current = { lineId, prev: cantidadActual }
    scanBufferRef.current = ''
  }

  /** Cambio manual de cantidad desde el teclado (no escáner). Recuerda el valor para restaurar tras escaneo. */
  const onCantidadInput = (lineId, value) => {
    // Si es una ráfaga de escáner, el listener global ya lo bloqueó; acá solo llega tipeo humano
    // salvo el primer dígito. Guardamos el valor "limpio" para poder restaurarlo si luego se detecta escaneo.
    if (cantidadFocusRef.current && cantidadFocusRef.current.lineId === lineId) {
      // Recordamos el valor solo si parece una cantidad real (no un código escaneado).
      const digitos = String(value).replace(/\D/g, '')
      if (digitos.length <= 6) cantidadFocusRef.current.prev = value
    }
    setCantidadDirect(lineId, value)
  }

  const liberarEdicionCantidad = () => {
    const focused = cantidadFocusRef.current
    edicionManualRef.current = false
    cantidadFocusRef.current = null
    scanBufferRef.current = ''

    if (focused?.lineId != null) {
      setCart((prev) =>
        prev.map((row) => {
          if (idLineaCarrito(row) !== focused.lineId) return row
          const p = productos.find((x) => x.id === row.producto_id)
          if (!p || !esVentaPorMedidaDecimal(p.unidad_medida)) return row
          const raw = String(row.cantidad ?? '')
            .trim()
            .replace(',', '.')
          if (raw === '' || raw === '.') {
            return { ...row, cantidad: '' }
          }
          const parsed = parseFloat(raw)
          if (Number.isNaN(parsed) || parsed <= 0) {
            return { ...row, cantidad: '' }
          }
          const max = maxCantidadParaLinea(prev, row, p)
          let n = redondearCantidad(parsed, 4)
          if (n > 0 && n < 0.001) n = 0.001
          return { ...row, cantidad: Math.min(n, max) }
        })
      )
    }

    focusSearch()
  }

  const updatePrecio = (lineId, value) => {
    if (esVendedorSolo) return
    const precio = parseFloat(value)
    setCart((prev) =>
      prev.map((line) => {
        if (idLineaCarrito(line) !== lineId) return line
        // Café máquina: precio fijo de lista (no editable)
        if (esNombreCafeMaquina(line.nombre) && !line.es_linea_promo) {
          const p = productos.find((x) => Number(x.id) === Number(line.producto_id))
          const lista = Number(p?.precio_venta ?? line.precio_unitario) || 0
          return { ...line, precio_unitario: lista }
        }
        if (Number.isNaN(precio)) return { ...line, precio_unitario: 0 }
        // Entrega envase: mantener crédito (negativo)
        if (line.es_envase_entrega) {
          const abs = Math.abs(precio)
          return { ...line, precio_unitario: abs > 0 ? -abs : 0 }
        }
        return { ...line, precio_unitario: Math.max(0, precio) }
      })
    )
  }

  const itemIncidenciaDesdeLinea = useCallback((line) => {
    const cantidad = numCantidadLinea(line.cantidad)
    const precio = Number(line.precio_unitario) || 0
    return {
      producto_id: line.producto_id ?? null,
      nombre: line.nombre,
      codigo: line.codigo ?? null,
      cantidad: cantidad > 0 ? cantidad : 1,
      precio_unitario: precio,
      subtotal: subtotalLineaPromo({
        ...line,
        cantidad: cantidad > 0 ? cantidad : 1
      }),
      es_linea_promo: Boolean(line.es_linea_promo),
      promo_nombre: line.promo_nombre || null,
      es_cobro_fiado: Boolean(line.es_cobro_fiado),
      fiado_id: line.fiado_id ?? null,
      fiado_cliente: line.fiado_cliente || null
    }
  }, [])

  const tipoIncidenciaParaLineas = useCallback((lines, { vaciado = false } = {}) => {
    const list = (Array.isArray(lines) ? lines : []).filter(Boolean)
    const esFiado = list.length > 0 && list.every((l) => l.es_cobro_fiado)
    if (esFiado) return vaciado || list.length > 1 ? 'fiado_carrito' : 'fiado'
    return vaciado || list.length > 1 ? 'carrito' : 'linea'
  }, [])

  const registrarIncidenciaCarrito = useCallback(
    async (tipo, lines) => {
      const list = (Array.isArray(lines) ? lines : []).filter(Boolean)
      if (list.length === 0) return
      try {
        await incidenciasAPI.registrar({
          tipo,
          items: list.map(itemIncidenciaDesdeLinea)
        })
      } catch (e) {
        console.error('No se pudo registrar la incidencia:', e)
      }
    },
    [itemIncidenciaDesdeLinea]
  )

  const removeLine = (lineId) => {
    const line = cart.find((l) => idLineaCarrito(l) === lineId)
    if (line) registrarIncidenciaCarrito(tipoIncidenciaParaLineas([line]), [line])
    setCart((prev) => prev.filter((l) => idLineaCarrito(l) !== lineId))
  }

  const vaciarCarrito = () => {
    const soloVenta = cart.filter((l) => !l.es_cobro_fiado)
    const soloFiado = cart.filter((l) => l.es_cobro_fiado)
    if (soloVenta.length > 0) {
      registrarIncidenciaCarrito(tipoIncidenciaParaLineas(soloVenta, { vaciado: true }), soloVenta)
    }
    if (soloFiado.length > 0) {
      registrarIncidenciaCarrito(tipoIncidenciaParaLineas(soloFiado, { vaciado: true }), soloFiado)
    }
    setCart([])
    setMetodoPago('')
    setPagoCombinado(false)
    setMontosPago({ efectivo: '', transferencia: '', tarjeta: '', fiado: '' })
    setMontoRecibidoEfectivo('')
    setClienteFiado('')
    showToast({
      type: 'msg',
      variant: 'info',
      message: 'Carrito eliminado'
    })
    focusSearch()
  }

  const total = useMemo(
    () => Math.round(cart.reduce((s, l) => s + subtotalLineaPromo(l), 0) * 100) / 100,
    [cart]
  )
  const lineasCobroFiado = useMemo(() => cart.filter((l) => l.es_cobro_fiado), [cart])
  const totalCobroFiado = useMemo(
    () => lineasCobroFiado.reduce((s, l) => s + subtotalLineaPromo(l), 0),
    [lineasCobroFiado]
  )
  const clienteCobroFiado = useMemo(() => clienteFiadoDesdeCarrito(cart), [cart])
  const soloCobroFiadoEnCarrito =
    cart.length > 0 && cart.every((l) => l.es_cobro_fiado)
  const esDevolucionEnvase =
    total < -0.009 && cart.some((l) => l.es_envase_entrega)

  useEffect(() => {
    if (!showCobrarModal) return
    const ids = fiadoIdsDesdeCarrito(cart)
    if (!ids.length) return

    let cancelled = false
    ;(async () => {
      try {
        const { data } = await fiadosAPI.listar({ estado: 'pendiente', limit: 500 })
        const fiados = (Array.isArray(data) ? data : []).filter((f) =>
          ids.includes(Number(f.id))
        )
        if (!fiados.length || cancelled) return

        const nuevasLineas = lineasCarritoDesdeFiados(fiados)
        const idsSet = new Set(ids)
        setCart((prev) => {
          const sinFiado = prev.filter(
            (l) => !l.es_cobro_fiado || !idsSet.has(Number(l.fiado_id))
          )
          return [...sinFiado, ...nuevasLineas]
        })
      } catch {
        // Si falla la actualización, se cobra con los montos sincronizados en el servidor.
      }
    })()

    return () => {
      cancelled = true
    }
  }, [showCobrarModal])

  useEffect(() => {
    if (!showCobrarModal) return
    if (soloCobroFiadoEnCarrito && clienteCobroFiado && !String(clienteFiado).trim()) {
      setClienteFiado(clienteCobroFiado)
    }
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await fiadosAPI.clientes({ limit: 120 })
        if (!cancelled) setClientesFiado(Array.isArray(data) ? data : [])
      } catch {
        if (!cancelled) setClientesFiado([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [showCobrarModal, soloCobroFiadoEnCarrito, clienteCobroFiado, clienteFiado])

  const sugerenciasFiado = useMemo(() => {
    const t = String(clienteFiado || '')
      .trim()
      .toLowerCase()
    const list = Array.isArray(clientesFiado) ? clientesFiado : []
    if (!t) return list.slice(0, 8)
    return list
      .filter((c) => String(c.cliente_nombre || '').toLowerCase().includes(t))
      .slice(0, 8)
  }, [clientesFiado, clienteFiado])

  const clienteFiadoSeleccionado = useMemo(() => {
    const t = String(clienteFiado || '')
      .trim()
      .toLowerCase()
    if (!t) return null
    return (
      clientesFiado.find((c) => String(c.cliente_nombre || '').toLowerCase() === t) || null
    )
  }, [clientesFiado, clienteFiado])

  const elegirClienteFiado = (c) => {
    setClienteFiado(c.cliente_nombre || '')
    setMostrarSugerenciasFiado(false)
    setSugerenciaFiadoIdx(-1)
  }

  const onKeyDownClienteFiado = (e) => {
    if (!mostrarSugerenciasFiado || sugerenciasFiado.length === 0) {
      if (e.key === 'Escape') setMostrarSugerenciasFiado(false)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSugerenciaFiadoIdx((i) => Math.min(i + 1, sugerenciasFiado.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSugerenciaFiadoIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && sugerenciaFiadoIdx >= 0) {
      e.preventDefault()
      elegirClienteFiado(sugerenciasFiado[sugerenciaFiadoIdx])
    } else if (e.key === 'Escape') {
      setMostrarSugerenciasFiado(false)
      setSugerenciaFiadoIdx(-1)
    }
  }

  const campoNombreFiado = (inputId) => (
    <div className="relative">
      <label htmlFor={inputId} className="text-xs font-medium text-amber-900 block">
        Nombre de la persona
      </label>
      <input
        id={inputId}
        type="text"
        autoComplete="off"
        placeholder="Buscar o escribir nombre…"
        value={clienteFiado}
        onChange={(e) => {
          setClienteFiado(e.target.value)
          setMostrarSugerenciasFiado(true)
          setSugerenciaFiadoIdx(-1)
        }}
        onFocus={() => {
          marcarEdicionManual()
          setMostrarSugerenciasFiado(true)
        }}
        onBlur={() => {
          setTimeout(() => setMostrarSugerenciasFiado(false), 150)
          liberarEdicionManual()
        }}
        onKeyDown={onKeyDownClienteFiado}
        className="w-full mt-1 px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
      />
      {mostrarSugerenciasFiado && sugerenciasFiado.length > 0 && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded-lg border border-amber-200 bg-white shadow-lg">
          {sugerenciasFiado.map((c, idx) => (
            <li key={c.cliente_nombre}>
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm hover:bg-amber-50 ${
                  idx === sugerenciaFiadoIdx ? 'bg-amber-50' : ''
                }`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  elegirClienteFiado(c)
                }}
              >
                <span className="font-medium text-gray-900">{c.cliente_nombre}</span>
                {Number(c.total_debe) > 0 ? (
                  <span className="block text-[11px] text-amber-800 tabular-nums">
                    Debe {fmtMoney(c.total_debe)} · {c.compras_pendientes || 0} compra(s)
                  </span>
                ) : (
                  <span className="block text-[11px] text-gray-500">Sin deuda pendiente</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {clienteFiadoSeleccionado && Number(clienteFiadoSeleccionado.total_debe) > 0 && (
        <p className="mt-1.5 text-xs font-medium text-amber-900 tabular-nums">
          Cuenta actual: {fmtMoney(clienteFiadoSeleccionado.total_debe)} (
          {clienteFiadoSeleccionado.compras_pendientes || 0} compra
          {Number(clienteFiadoSeleccionado.compras_pendientes) === 1 ? '' : 's'})
        </p>
      )}
      {String(clienteFiado).trim() && !clienteFiadoSeleccionado && (
        <p className="mt-1.5 text-[11px] text-amber-800">
          Nombre nuevo: se creará la cuenta al confirmar.
        </p>
      )}
      <p className="mt-1 text-[11px] text-amber-800">
        Se guarda en Fiados sumando a la misma persona. No suma al efectivo de caja.
      </p>
    </div>
  )

  const puedeCobrar =
    !submitting &&
    cart.length > 0 &&
    (total >= -0.009 || esDevolucionEnvase) &&
    !cart.some((l) => {
      const q = numCantidadLinea(l.cantidad)
      return !Number.isFinite(q) || q <= 0
    })

  const abrirCobrar = () => {
    if (cart.length === 0) {
      showToast({ type: 'msg', variant: 'warn', message: 'Agregue al menos un producto al carrito' })
      return
    }
    const sinCantidad = cart.find((l) => {
      const q = numCantidadLinea(l.cantidad)
      return !Number.isFinite(q) || q <= 0
    })
    if (sinCantidad) {
      showToast({
        type: 'msg',
        variant: 'warn',
        message: 'Indique la cantidad de cada ítem (con decimales si el producto es por kg o por litro).'
      })
      return
    }
    setShowCobrarModal(true)
  }

  const ejecutarRegistroVenta = async (payload) => {
    setSubmitting(true)
    try {
      const { data } = await ventasAPI.registrar(payload)
      showToast({ type: 'venta', importe: data.totalImporte, lineas: data.lineas })
      if (Number(data?.fiadosCobrados || 0) > 0) {
        setTimeout(() => {
          showToast({
            type: 'msg',
            variant: 'info',
            message: `Fiado cobrado (${data.fiadosCobrados} registro${data.fiadosCobrados === 1 ? '' : 's'})`
          })
        }, 3200)
      }
      if (data?.cafeMaquina?.exceso && (cart || []).some((l) => esNombreCafeMaquina(l.nombre))) {
        setTimeout(() => {
          showToast({
            type: 'msg',
            variant: 'warn',
            message: `Alerta café máquina: ${Number(data.cafeMaquina.unidades).toLocaleString('es-ES')} / ${data.cafeMaquina.umbral} este mes (exceso)`
          })
        }, 3200)
      }
      setCart([])
      setMetodoPago('')
      setPagoCombinado(false)
      setMontosPago({ efectivo: '', transferencia: '', tarjeta: '', fiado: '' })
      setMontoRecibidoEfectivo('')
      setClienteFiado('')
      setMostrarSugerenciasFiado(false)
      setSugerenciaFiadoIdx(-1)
      setVerifTransferencia(null)
      setShowCobrarModal(false)
      try {
        const { data: cli } = await fiadosAPI.clientes({ limit: 120 })
        setClientesFiado(Array.isArray(cli) ? cli : [])
      } catch {
        /* ignore */
      }
      await loadProductos()
      focusSearch()
    } catch (e) {
      showToast({
        type: 'msg',
        variant: 'error',
        message: e.response?.data?.error || 'No se pudo registrar la venta'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const registrarVenta = async (paymentOverride = null) => {
    const payCombinado = paymentOverride?.pagoCombinado ?? pagoCombinado
    const payMetodo = paymentOverride?.metodoPago ?? metodoPago
    const payMontos = paymentOverride?.montosPago ?? montosPago
    const payMetodosSel = paymentOverride?.metodosSeleccionados ?? null

    if (cart.length === 0) {
      showToast({ type: 'msg', variant: 'warn', message: 'Agregue al menos un producto al carrito' })
      return
    }
    if (!payCombinado && !payMetodo) {
      showToast({ type: 'msg', variant: 'warn', message: 'Seleccione un método de pago.' })
      return
    }
    const sinCantidad = cart.find((l) => {
      const q = numCantidadLinea(l.cantidad)
      return !Number.isFinite(q) || q <= 0
    })
    if (sinCantidad) {
      showToast({
        type: 'msg',
        variant: 'warn',
        message: 'Indique la cantidad de cada ítem (con decimales si el producto es por kg o por litro).'
      })
      return
    }

    const montoFiadoPay = parseMontoPago(payMontos.fiado)
    const requiereFiadoNombre =
      (!payCombinado && payMetodo === 'fiado') ||
      (payCombinado && !Number.isNaN(montoFiadoPay) && montoFiadoPay > 0)

    if (requiereFiadoNombre && !String(clienteFiado).trim() && !clienteCobroFiado) {
      showToast({
        type: 'msg',
        variant: 'warn',
        message: 'Indicá el nombre de la persona del fiado'
      })
      return
    }

    if (payMetodo === 'retiro') {
      if (payCombinado) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: 'El retiro no se puede combinar con otros métodos de pago.'
        })
        return
      }
      if (cart.some((l) => l.es_cobro_fiado)) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: 'Sacá el cobro de fiado del carrito para registrar un retiro de mercadería.'
        })
        return
      }

      const itemsRetiro = itemsVentaDesdeCarrito(cart)
        .filter((it) => !it.es_cobro_fiado)
        .map((it) => ({
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario
        }))

      if (itemsRetiro.length === 0) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: 'No hay productos para retirar.'
        })
        return
      }

      const nombreDueno = String(paymentOverride?.nombreDueno || '').trim()
      if (!nombreDueno) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: 'Indicá el nombre del dueño.'
        })
        return
      }

      setSubmitting(true)
      try {
        const { data } = await retirosAPI.mercaderiaLote({ items: itemsRetiro, motivo: nombreDueno })
        showToast({
          type: 'msg',
          variant: 'info',
          message: `Retiro de mercadería: ${data.lineas} producto(s) · valor ${fmtMoney(data.totalImporte)}.`
        })
        setCart([])
        setMetodoPago('')
        setPagoCombinado(false)
        setMontosPago({ efectivo: '', transferencia: '', tarjeta: '', fiado: '' })
        setMontoRecibidoEfectivo('')
        setClienteFiado('')
        setMostrarSugerenciasFiado(false)
        setSugerenciaFiadoIdx(-1)
        setVerifTransferencia(null)
        setShowCobrarModal(false)
        await loadProductos()
        focusSearch()
      } catch (e) {
        showToast({
          type: 'msg',
          variant: 'error',
          message: e.response?.data?.error || 'No se pudo registrar el retiro de mercadería'
        })
      } finally {
        setSubmitting(false)
      }
      return
    }

    const totalRed = total
    if (totalRed < -0.009) {
      const tieneEnvaseDev = cart.some((l) => l.es_envase_entrega)
      if (!tieneEnvaseDev) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: 'El total no puede ser negativo. Solo se permite con ENVASE (devolución) en el carrito.'
        })
        return
      }
      if (payCombinado) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: 'En una devolución de envase usá un solo método de pago (sin combinar).'
        })
        return
      }
      if (payMetodo === 'fiado') {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: 'La devolución de envase no se puede registrar como fiado.'
        })
        return
      }
    }
    let payload = {
      items: itemsVentaDesdeCarrito(cart).map((it) => {
        if (it.promo_id) return it
        const p = productos.find((x) => Number(x.id) === Number(it.producto_id))
        if (p && esNombreCafeMaquina(p.nombre)) {
          return { ...it, precio_unitario: Number(p.precio_venta) || 0 }
        }
        return it
      }),
      usuario: usuarioVenta || undefined
    }
    if (requiereFiadoNombre) {
      payload.cliente_fiado = String(clienteFiado).trim() || clienteCobroFiado
    }

    let montoTransferencia = 0
    if (payCombinado) {
      const keysPago = payMetodosSel?.length ? payMetodosSel : METODOS_PAGO.map((m) => m.key)
      let entries = paymentOverride?.pagosResueltos
      if (!entries?.length) {
        const resolucion = resolverPagosCombinados(keysPago, payMontos, totalRed)
        if (!resolucion.ok) {
          showToast({
            type: 'msg',
            variant: 'warn',
            message:
              resolucion.error ||
              (resolucion.estado === 'falta'
                ? `Falta completar el pago por ${fmtMoney(resolucion.resta || 0)}.`
                : 'Revisá los importes de cada método de pago.')
          })
          return
        }
        entries = resolucion.entries
      }
      if (!entries || entries.length < 2) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: 'Con pago combinado, indicá al menos dos medios con importe mayor a 0.'
        })
        return
      }
      const suma = Math.round(entries.reduce((s, x) => s + x.monto, 0) * 100) / 100
      if (Math.abs(suma - totalRed) > 0.05) {
        showToast({
          type: 'msg',
          variant: 'warn',
          message: `La suma de los medios (${fmtMoney(suma)}) debe coincidir con el total (${fmtMoney(totalRed)}).`
        })
        return
      }
      payload = { ...payload, pagos: entries }
      montoTransferencia = entries.find((e) => e.metodo === 'transferencia')?.monto || 0
    } else {
      payload = { ...payload, metodo_pago: payMetodo }
      if (payMetodo === 'transferencia') montoTransferencia = totalRed
    }

    // Si hay transferencia, mostrar comprobación de MP antes de registrar.
    if (montoTransferencia > 0.009) {
      setVerifTransferencia({ payload, montoEsperado: montoTransferencia })
      return
    }

    await ejecutarRegistroVenta(payload)
  }

  if (loading) {
    return (
      <div className="relative text-center py-12 text-gray-600">
        {necesitaApertura && (
          <InicioCajaModal
            sugerido={sugeridoCaja}
            onConfirm={confirmarInicioCaja}
            submitting={abriendoCaja}
            puedeEditarMonto={!esVendedorSolo}
          />
        )}
        Cargando productos…
      </div>
    )
  }

  return (
    <div className="relative w-full max-w-[min(100%,100rem)]">
      {necesitaApertura && (
        <InicioCajaModal
          sugerido={sugeridoCaja}
          onConfirm={confirmarInicioCaja}
          submitting={abriendoCaja}
          puedeEditarMonto={!esVendedorSolo}
        />
      )}

      {showCobrarModal && (
        <CobrarVentaModal
          open={showCobrarModal}
          total={total}
          esDevolucionEnvase={esDevolucionEnvase}
          submitting={submitting}
          onClose={() => {
            if (submitting) return
            setShowCobrarModal(false)
          }}
          onConfirm={(config) => registrarVenta(config)}
          renderCampoFiado={campoNombreFiado}
        />
      )}

      {verifTransferencia &&
        (mpQrCobroDisponible ? (
          <CobrarQrMpModal
            montoEsperado={verifTransferencia.montoEsperado}
            confirming={submitting}
            onCancel={() => {
              if (submitting) return
              setVerifTransferencia(null)
            }}
            onConfirm={() => ejecutarRegistroVenta(verifTransferencia.payload)}
          />
        ) : (
          <VerificarTransferenciaMpModal
            montoEsperado={verifTransferencia.montoEsperado}
            confirming={submitting}
            onCancel={() => {
              if (submitting) return
              setVerifTransferencia(null)
            }}
            onConfirm={() => ejecutarRegistroVenta(verifTransferencia.payload)}
          />
        ))}

      {toast && (
        <div
          className={`fixed left-4 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:bottom-6 z-[100] sm:max-w-sm rounded-xl border px-4 sm:px-5 py-3 sm:py-4 text-white shadow-lg ${
            toast.type === 'venta'
              ? 'border-emerald-600 bg-emerald-900'
              : toast.variant === 'error'
                ? 'border-red-600 bg-red-900'
                : toast.variant === 'warn'
                  ? 'border-amber-600 bg-amber-950'
                  : 'border-slate-600 bg-slate-900'
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.type === 'venta' ? (
            <div className="flex items-start gap-3">
              <CheckCircle className="shrink-0 text-emerald-300 mt-0.5" size={22} />
              <div>
                <p className="font-semibold">Venta registrada correctamente</p>
                <p className="mt-1 text-sm text-emerald-100">Importe total: {fmtMoney(toast.importe)}</p>
                <p className="text-sm text-emerald-100">Líneas: {toast.lineas}</p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              {toast.variant === 'error' ? (
                <AlertCircle className="shrink-0 text-red-300 mt-0.5" size={22} />
              ) : toast.variant === 'warn' ? (
                <AlertTriangle className="shrink-0 text-amber-300 mt-0.5" size={22} />
              ) : (
                <Info className="shrink-0 text-slate-300 mt-0.5" size={22} />
              )}
              <p className={`text-sm font-medium leading-snug ${
                toast.variant === 'error'
                  ? 'text-red-50'
                  : toast.variant === 'warn'
                    ? 'text-amber-50'
                    : 'text-slate-100'
              }`}>
                {toast.message}
              </p>
            </div>
          )}
        </div>
      )}

      <header className="page-header flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-3">
        <h2 className="page-title mb-0">
          <ShoppingCart className="text-brand-600 shrink-0" size={28} />
          Ventas
        </h2>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={reiniciarContadorCafe}
            disabled={reiniciandoCafe || necesitaApertura}
            className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-sm shadow-sm disabled:opacity-50"
            title="Pone el contador en 0 y deja el reporte en Movimientos"
          >
            {reiniciandoCafe ? (
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <Coffee size={18} />
            )}
            <RotateCcw size={16} className="opacity-90" />
            <span className="sm:hidden">Reiniciar café</span>
            <span className="hidden sm:inline">Reiniciar contador café</span>
          </button>
          <button
            type="button"
            onClick={abrirConsultar}
            className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-2 px-4 sm:px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow-sm"
          >
            <Search size={18} />
            Consultar
          </button>
        </div>
      </header>

      {promoChoiceModal && (
        <ElegirPromoProductoModal
          producto={promoChoiceModal.producto}
          promociones={promoChoiceModal.promos}
          onElegirSuelto={confirmarPromoChoiceSuelto}
          onElegirPromo={confirmarPromoChoicePromo}
          onClose={cerrarPromoChoiceModal}
        />
      )}

      {envaseModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/45"
          onClick={cerrarEnvaseModal}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="envase-titulo"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <h3 id="envase-titulo" className="text-lg font-semibold text-gray-900">
                Envase retornable
              </h3>
              <button
                type="button"
                onClick={cerrarEnvaseModal}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-gray-700">
                <span className="font-semibold text-gray-900">{envaseModal.producto?.nombre}</span>
              </p>
              {envaseModal.fase === 'pregunta' ? (
                <>
                  <p className="text-base font-medium text-gray-900">¿Entrega envase?</p>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={confirmarEnvaseSi}
                      className="flex-1 min-w-[7rem] px-4 py-3 rounded-xl bg-emerald-600 text-white font-semibold hover:bg-emerald-700"
                    >
                      Sí
                    </button>
                    <button
                      type="button"
                      onClick={confirmarEnvaseNo}
                      className="flex-1 min-w-[7rem] px-4 py-3 rounded-xl bg-amber-600 text-white font-semibold hover:bg-amber-700"
                    >
                      No
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700">Ingresá el monto a cobrar por el envase:</p>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Monto envase</label>
                    <input
                      type="text"
                      inputMode="decimal"
                      autoFocus
                      value={envaseModal.monto}
                      onFocus={marcarEdicionManual}
                      onChange={(e) =>
                        setEnvaseModal((prev) => (prev ? { ...prev, monto: e.target.value } : null))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          confirmarEnvaseMonto()
                        }
                      }}
                      placeholder="0,00"
                      className="w-full px-3 py-2.5 border-2 border-sky-200 rounded-xl text-lg font-semibold tabular-nums focus:ring-2 focus:ring-sky-500/30 focus:border-sky-400"
                    />
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setEnvaseModal((prev) => (prev ? { ...prev, fase: 'pregunta' } : null))
                      }
                      className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
                    >
                      Volver
                    </button>
                    <button
                      type="button"
                      onClick={confirmarEnvaseMonto}
                      className="flex-1 px-4 py-2.5 rounded-xl bg-sky-600 text-white font-semibold text-sm hover:bg-sky-700"
                    >
                      Agregar producto + envase
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {entregaEnvaseModal && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/45"
          onClick={cerrarEntregaEnvaseModal}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="entrega-envase-titulo"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <h3 id="entrega-envase-titulo" className="text-lg font-semibold text-gray-900">
                Devuelve envase
              </h3>
              <button
                type="button"
                onClick={cerrarEntregaEnvaseModal}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-sm text-gray-700">
                Ingresá el monto a descontar por la devolución del envase:
              </p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Monto envase</label>
                <input
                  type="text"
                  inputMode="decimal"
                  autoFocus
                  value={entregaEnvaseModal.monto}
                  onFocus={marcarEdicionManual}
                  onChange={(e) =>
                    setEntregaEnvaseModal((prev) =>
                      prev ? { ...prev, monto: e.target.value } : null
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      confirmarEntregaEnvaseMonto()
                    }
                  }}
                  placeholder="0,00"
                  className="w-full px-3 py-2.5 border-2 border-emerald-200 rounded-xl text-lg font-semibold tabular-nums focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={cerrarEntregaEnvaseModal}
                  className="px-4 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-medium text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={confirmarEntregaEnvaseMonto}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700"
                >
                  Descontar del total
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showConsultar && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/45"
          onClick={cerrarConsultar}
          role="presentation"
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[min(90vh,820px)] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="consultar-titulo"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 shrink-0">
              <h3 id="consultar-titulo" className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Search size={20} className="text-brand-600" />
                Consultar productos
              </h3>
              <button
                type="button"
                onClick={cerrarConsultar}
                className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="px-5 py-4 border-b border-gray-50 shrink-0">
              <label htmlFor="consulta-buscar" className="block text-sm font-medium text-gray-700 mb-2">
                Buscar por nombre o código de barras
              </label>
              <div className="relative">
                <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input
                  id="consulta-buscar"
                  ref={consultaRef}
                  type="text"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Escribí, escaneá o buscá por nombre…"
                  value={consultaTerm}
                  onChange={(e) => {
                    setConsultaTerm(e.target.value)
                    setProductoConsultaSel(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      e.preventDefault()
                      cerrarConsultar()
                      return
                    }
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      if (productosConsulta.length === 1) {
                        const p = productosConsulta[0]
                        if (productoNoControlaStock(p)) {
                          setProductoConsultaSel(p)
                          return
                        }
                        const enCarrito = qtyForProduct(cart, p.id)
                        const disp = redondearCantidad(Number(p.stock_actual) - enCarrito, 4)
                        if (disp > EPS) setProductoConsultaSel(p)
                      }
                    }
                  }}
                  className="w-full pl-10 pr-4 py-3 border-2 border-brand-200 rounded-xl focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 font-mono text-sm"
                />
              </div>
              <p className="text-xs text-gray-500 mt-2">
                Elegí un producto de la lista y después tocá <strong>Seleccionar</strong> para cargarlo al carrito.
              </p>
            </div>

            <ul className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-0">
              {productosConsulta.length === 0 ? (
                <li className="px-5 py-12 text-center text-gray-500 text-sm">Sin coincidencias</li>
              ) : (
                productosConsulta.map((p) => {
                  const sinStock = productoNoControlaStock(p)
                  const enCarrito = qtyForProduct(cart, p.id)
                  const disp = sinStock
                    ? MAX_CANTIDAD_SIN_STOCK
                    : redondearCantidad(Number(p.stock_actual) - enCarrito, 4)
                  const disabled = !sinStock && disp <= EPS
                  const promo = promoPorProducto.get(Number(p.id))
                  const precioMostrar = precioParaProducto(p)
                  const seleccionado = productoConsultaSel?.id === p.id
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => !disabled && setProductoConsultaSel(p)}
                        className={`w-full text-left px-5 py-3.5 flex justify-between items-start gap-3 transition-colors ${
                          disabled
                            ? 'opacity-50 cursor-not-allowed bg-gray-50'
                            : seleccionado
                              ? 'bg-brand-50 ring-2 ring-inset ring-brand-400'
                              : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900">{p.nombre}</p>
                          <p className="text-xs text-gray-500 font-mono mt-0.5">{p.codigo || 'Sin código'}</p>
                          {esUnidadKg(p.unidad_medida) ? (
                            <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                              Peso · kg
                            </span>
                          ) : esUnidadLitro(p.unidad_medida) ? (
                            <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wide text-sky-900 bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded">
                              Por litro · l
                            </span>
                          ) : (
                            <span className="inline-block mt-1 text-[10px] text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">
                              Por unidad
                            </span>
                          )}
                          {sinStock && (
                            <span className="inline-block mt-1 ml-1 text-[10px] font-semibold uppercase tracking-wide text-violet-900 bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded">
                              Sin stock
                            </span>
                          )}
                          {promo && (
                            <span className="inline-block mt-1 ml-1 text-[10px] font-semibold uppercase tracking-wide text-amber-900 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                              Promo
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base font-bold text-emerald-700 tabular-nums">{fmtMoney(precioMostrar)}</p>
                          <p className={`text-xs mt-0.5 ${!sinStock && disp <= EPS ? 'text-red-600' : 'text-gray-500'}`}>
                            {sinStock
                              ? 'Elaborado · sin stock'
                              : `Stock: ${fmtCantidadStock(p.stock_actual, p.unidad_medida)}${
                                  enCarrito > EPS ? ` · libre ${fmtCantidadStock(disp, p.unidad_medida)}` : ''
                                }`}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })
              )}
            </ul>

            <div className="px-5 py-4 border-t border-gray-100 bg-gray-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <p className="text-sm text-gray-600 min-w-0 flex-1">
                {productoConsultaSel ? (
                  <>
                    Seleccionado:{' '}
                    <span className="font-semibold text-gray-900">{productoConsultaSel.nombre}</span>
                    <span className="text-emerald-700 font-semibold ml-2">
                      {fmtMoney(precioParaProducto(productoConsultaSel))}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400">Ningún producto seleccionado</span>
                )}
              </p>
              <div className="flex gap-2 shrink-0">
                <button
                  type="button"
                  onClick={cerrarConsultar}
                  className="px-5 py-2.5 rounded-xl border border-gray-300 text-gray-700 font-semibold text-sm hover:bg-white"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!productoConsultaSel}
                  onClick={confirmarSeleccionConsulta}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-45 disabled:cursor-not-allowed"
                >
                  Seleccionar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6 w-full">
        <div className="card p-4 sm:p-6 w-full">
          <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
            <ScanBarcode size={18} className="text-brand-600" />
            Buscar o escanear producto
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 z-10" size={20} />
            <input
              ref={searchRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder="Producto, promoción, código o escaneo + Enter"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                setMostrarSugerencias(true)
                setSugerenciaIdx(-1)
              }}
              onFocus={() => {
                if (searchTerm.trim()) setMostrarSugerencias(true)
              }}
              onBlur={() => {
                // Delay para permitir click en una sugerencia
                setTimeout(() => {
                  setMostrarSugerencias(false)
                  setSugerenciaIdx(-1)
                }, 150)
              }}
              onKeyDown={onSearchKeyDown}
              className="w-full pl-10 pr-4 py-3 border-2 border-brand-200 rounded-xl focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 font-mono text-sm bg-white relative z-[1]"
            />
            {sugerenciasVisibles && (
              <ul
                ref={sugerenciasListRef}
                className="absolute left-0 right-0 top-full mt-1 z-20 max-h-72 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg divide-y divide-gray-100"
              >
                {filtered.map((item, idx) => {
                  const activo = idx === sugerenciaIdx
                  if (item.kind === 'promo') {
                    const pr = item.promo
                    return (
                      <li key={item.key} data-sugerencia-idx={idx}>
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            aplicarPromocionAlCarrito(pr)
                            setMostrarSugerencias(false)
                            setSugerenciaIdx(-1)
                            setSearchTerm('')
                          }}
                          onMouseEnter={() => setSugerenciaIdx(idx)}
                          className={`w-full text-left px-4 py-2.5 flex justify-between gap-3 transition-colors ${
                            activo ? 'bg-violet-50' : 'hover:bg-violet-50/60'
                          }`}
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-gray-900 text-sm truncate flex items-center gap-1.5">
                              <Tag size={14} className="text-violet-600 shrink-0" />
                              {pr.nombre}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-semibold text-violet-700 tabular-nums">
                              {fmtMoney(pr.precio_promocional)}
                            </p>
                            <p className="text-[11px] font-semibold uppercase text-violet-600">Promo</p>
                          </div>
                        </button>
                      </li>
                    )
                  }

                  const p = item.producto
                  const sinStock = productoNoControlaStock(p)
                  const enCarrito = qtyForProduct(cart, p.id)
                  const disp = sinStock
                    ? MAX_CANTIDAD_SIN_STOCK
                    : redondearCantidad(Number(p.stock_actual) - enCarrito, 4)
                  const disabled = !sinStock && disp <= EPS
                  return (
                    <li key={item.key} data-sugerencia-idx={idx}>
                      <button
                        type="button"
                        disabled={disabled}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          if (disabled) return
                          addToCart(p, { preguntarPromo: false })
                          setMostrarSugerencias(false)
                          setSugerenciaIdx(-1)
                        }}
                        onMouseEnter={() => setSugerenciaIdx(idx)}
                        className={`w-full text-left px-4 py-2.5 flex justify-between gap-3 transition-colors ${
                          disabled
                            ? 'opacity-45 cursor-not-allowed bg-gray-50'
                            : activo
                              ? 'bg-brand-50'
                              : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{p.nombre}</p>
                          <p className="text-xs font-mono text-gray-500">{p.codigo || 'Sin código'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-emerald-700 tabular-nums">
                            {fmtMoney(precioParaProducto(p))}
                          </p>
                          <p className={`text-[11px] ${disabled ? 'text-red-600' : 'text-gray-500'}`}>
                            {sinStock
                              ? 'Elaborado · sin stock'
                              : `Stock: ${fmtCantidadStock(p.stock_actual, p.unidad_medida)}`}
                          </p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            {mostrarSugerencias && searchTerm.trim().length > 0 && filtered.length === 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-gray-200 bg-white shadow-lg px-4 py-3 text-sm text-gray-500">
                Sin coincidencias
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow border border-gray-200 overflow-hidden w-full">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex items-center gap-2">
            <Package size={22} />
            <span className="font-semibold text-lg">Carrito</span>
            {cart.length > 0 && (
              <span className="ml-auto text-sm bg-white/20 px-2 py-0.5 rounded-full">{cart.length} ítem(s)</span>
            )}
          </div>

          <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-white">
            <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tieneEntregaEnvase || Boolean(entregaEnvaseModal)}
                onChange={(e) => onToggleEntregaEnvase(e.target.checked)}
                className="h-5 w-5 rounded border-emerald-400 text-emerald-700 focus:ring-emerald-500 focus:ring-offset-0"
              />
              <span className="text-sm font-bold uppercase tracking-wide text-emerald-950">
                Devuelve envase
              </span>
            </label>
          </div>

          {lineasCobroFiado.length > 0 && (
            <div className="px-4 sm:px-5 py-3 border-b border-amber-200 bg-amber-50 text-sm text-amber-950">
              <p className="font-semibold">Cobro de fiado en carrito</p>
              <p className="text-xs text-amber-900/80 mt-0.5">
                {clienteCobroFiado ? `${clienteCobroFiado} · ` : ''}
                {fmtMoney(totalCobroFiado)} pendiente. Podés sumar más productos y cobrar todo junto.
              </p>
            </div>
          )}

          {cart.length === 0 ? (
            <div className="p-12 text-center text-gray-500 text-sm">
              El carrito está vacío. Busque o escanee productos para agregarlos.
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row lg:items-stretch">
              <div className="lg:w-[48%] xl:w-[45%] min-w-0 divide-y divide-gray-100 max-h-[min(70vh,640px)] overflow-y-auto">
                {cart.map((line) => {
                  const lineId = idLineaCarrito(line)
                  const esCobroFiado = Boolean(line.es_cobro_fiado)
                  const esPromo = line.es_linea_promo
                  const esEnvase = Boolean(line.es_envase)
                  const esCafeMaquinaLinea =
                    !esCobroFiado && !esPromo && !esEnvase && esNombreCafeMaquina(line.nombre)
                  const p =
                    esPromo || esEnvase || esCobroFiado
                      ? null
                      : productos.find((x) => x.id === line.producto_id)
                  const max = esPromo
                    ? maxUnidadesPromoEnCarrito(cart, line, productos, lineId)
                    : esEnvase
                      ? 99
                      : maxCantidadParaLinea(cart, line, p)
                  const lineaDecimal = !esPromo && !esEnvase && esVentaPorMedidaDecimal(line.unidad_medida)
                  const productoCajaRef = esPromo
                    ? productos.find(
                        (x) => Number(x.id) === Number(line.promo_detalle_stock?.[0]?.producto_id)
                      )
                    : p
                  const promoCaja =
                    !esEnvase &&
                    productoCajaRef &&
                    esCategoriaCigarrillos(productoCajaRef.categoria_nombre)
                      ? promoCajaParaProducto(promocionesActivas, productoCajaRef.id)
                      : null
                  const mostrarToggleCaja =
                    !esCobroFiado &&
                    Boolean(promoCaja) &&
                    promoTieneItems(promoCaja) &&
                    !productoNoControlaStock(productoCajaRef) &&
                    !esCigarrilloSoloCaja(productoCajaRef)
                  const cajaActiva =
                    Boolean(esPromo && promoCaja && Number(line.promo_id) === Number(promoCaja.id))
                  return (
                    <div key={lineId} className="p-4 sm:p-5 space-y-3">
                      <div className="flex justify-between gap-3 items-start">
                        <div className="min-w-0 flex-1 lg:max-w-sm">
                          <p className="font-medium text-gray-900 leading-snug line-clamp-2">{line.nombre}</p>
                          {esEnvase && line.envase_de_nombre && (
                            <p className="text-xs text-sky-800 mt-1">Por: {line.envase_de_nombre}</p>
                          )}
                          {esEnvase && line.es_envase_entrega && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-emerald-900 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded">
                              Descuento por devolución
                            </span>
                          )}
                          {esEnvase && !line.es_envase_entrega && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-sky-900 bg-sky-100 border border-sky-200 px-1.5 py-0.5 rounded">
                              Cobro de envase
                            </span>
                          )}
                          {esCobroFiado && (
                            <span className="inline-block mt-1 text-[10px] font-semibold text-amber-900 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded">
                              Cobro fiado
                              {line.fiado_cliente ? ` · ${line.fiado_cliente}` : ''}
                            </span>
                          )}
                          {mostrarToggleCaja && !esCobroFiado && (
                            <label className="mt-2 inline-flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={cajaActiva}
                                onChange={(e) => {
                                  if (e.target.checked) activarCajaCigarrillo(promoCaja)
                                  else desactivarCajaCigarrillo(line, promoCaja)
                                }}
                                className="h-5 w-5 rounded border-amber-400 text-amber-700 focus:ring-amber-500 focus:ring-offset-0"
                              />
                              <span className="text-sm font-bold uppercase tracking-wide text-amber-950">
                                Caja
                              </span>
                              <span className="text-sm font-semibold text-violet-900 tabular-nums">
                                {fmtMoney(promoCaja.precio_promocional)}
                              </span>
                            </label>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(lineId)}
                          className="text-red-600 hover:bg-red-50 p-2 rounded-lg shrink-0"
                          title="Quitar"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        {esCobroFiado ? (
                          <div className="text-sm text-gray-700 tabular-nums">
                            <span className="text-xs text-gray-500 block mb-1">Detalle</span>
                            {line.cantidad} × {fmtMoney(line.precio_unitario)} ={' '}
                            {fmtMoney(subtotalLineaPromo(line))}
                          </div>
                        ) : (
                          <>
                        <div className="w-[10.5rem]">
                          <label className="text-xs text-gray-600 block mb-1 leading-snug">
                            {esPromo ? 'Cantidad (promos)' : `Cantidad ${etiquetaCantidadUnidad(line.unidad_medida)}`}{' '}
                            <span className="text-gray-400">(máx. {max})</span>
                          </label>
                          <div className="flex items-stretch border border-gray-200 rounded-xl bg-gray-50/80 overflow-hidden">
                            <button
                              type="button"
                              className="shrink-0 px-2.5 py-2 hover:bg-gray-100 border-r border-gray-200"
                              onClick={() => updateCantidad(lineId, -1)}
                            >
                              <Minus size={16} />
                            </button>
                            <input
                              id={`ventas-cantidad-${lineId}`}
                              type={lineaDecimal ? 'text' : 'number'}
                              inputMode={lineaDecimal ? 'decimal' : 'numeric'}
                              min={
                                lineaDecimal
                                  ? undefined
                                  : line.cantidad === '' || line.cantidad === null
                                    ? undefined
                                    : 1
                              }
                              max={lineaDecimal ? undefined : max}
                              step={lineaDecimal ? undefined : 1}
                              value={
                                line.cantidad === '' || line.cantidad === null ? '' : line.cantidad
                              }
                              readOnly={!lineaDecimal}
                              onChange={
                                lineaDecimal
                                  ? (e) => onCantidadInput(lineId, e.target.value)
                                  : undefined
                              }
                              onFocus={
                                lineaDecimal
                                  ? (e) => {
                                      e.target.select()
                                      marcarEdicionCantidad(
                                        lineId,
                                        line.cantidad === '' || line.cantidad === null
                                          ? ''
                                          : line.cantidad
                                      )
                                    }
                                  : undefined
                              }
                              onBlur={lineaDecimal ? liberarEdicionCantidad : undefined}
                              className={`w-14 text-center border-0 py-2 text-base font-semibold bg-transparent tabular-nums ${
                                lineaDecimal ? '' : 'cursor-default select-none'
                              }`}
                            />
                            <button
                              type="button"
                              className="shrink-0 px-2.5 py-2 hover:bg-gray-100 border-l border-gray-200 disabled:opacity-40"
                              disabled={numCantidadLinea(line.cantidad) >= max - EPS}
                              onClick={() => updateCantidad(lineId, 1)}
                            >
                              <Plus size={16} />
                            </button>
                          </div>
                        </div>
                        <div className="w-[8.5rem]">
                          <label className="text-xs font-medium text-gray-700 block mb-1">
                            {esPromo
                              ? 'Precio promo'
                              : `P. unitario ${lineaDecimal ? etiquetaPrecioUnidad(line.unidad_medida) : ''}`}
                          </label>
                          <input
                            type="number"
                            min={line.es_envase_entrega ? undefined : '0'}
                            step="0.01"
                            value={
                              line.es_envase_entrega
                                ? Math.abs(Number(line.precio_unitario) || 0)
                                : line.precio_unitario
                            }
                            onChange={(e) => updatePrecio(lineId, e.target.value)}
                            onFocus={
                              esVendedorSolo || esCafeMaquinaLinea ? undefined : marcarEdicionManual
                            }
                            onBlur={
                              esVendedorSolo || esCafeMaquinaLinea ? undefined : liberarEdicionManual
                            }
                            readOnly={esVendedorSolo || esCafeMaquinaLinea}
                            className={`w-full px-3 py-2 border border-gray-200 rounded-xl text-base font-bold text-gray-900 tabular-nums focus:border-brand-400 focus:ring-2 focus:ring-brand-500/30 ${
                              esVendedorSolo || esCafeMaquinaLinea ? 'bg-gray-50 cursor-default' : ''
                            }`}
                          />
                        </div>
                        <div className="ml-auto text-right pb-1 min-w-[5.5rem]">
                          <span className="block text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                            Subtotal
                          </span>
                          <span
                            className={`text-base font-bold tabular-nums ${
                              line.es_envase_entrega ? 'text-red-700' : 'text-emerald-800'
                            }`}
                          >
                            {fmtMoney(subtotalLineaPromo(line))}
                          </span>
                        </div>
                          </>
                        )}
                      </div>
                      {esCobroFiado ? (
                        <p className="text-xs text-amber-800">
                          Producto de fiado pendiente: no descuenta stock al cobrar.
                        </p>
                      ) : esPromo ? (
                        <p className="text-xs text-gray-400">
                          Al confirmar la venta se descuenta el stock de cada producto incluido.
                        </p>
                      ) : line.es_envase_entrega ? (
                        <p className="text-xs text-emerald-700">
                          Descuento por devolución de envase (resta del total).
                        </p>
                      ) : esEnvase ? (
                        <p className="text-xs text-sky-700">
                          Cobro de envase (no descuenta stock).
                        </p>
                      ) : (
                        p && (
                          <p className="text-xs text-gray-400">
                            {productoNoControlaStock(p)
                              ? 'Producto elaborado: no descuenta stock (se discrimina en cierre de caja).'
                              : `Stock en tienda: ${fmtCantidadStock(p.stock_actual, line.unidad_medida)}`}
                          </p>
                        )
                      )}
                    </div>
                  )
                })}
                </div>

                <aside className="border-t lg:border-t-0 lg:border-l border-gray-200 bg-gray-50 p-5 sm:p-6 w-full lg:w-[52%] xl:w-[55%] flex flex-col gap-4">
                  <div className="text-center py-2">
                    <p className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-slate-400">
                      Total a pagar
                    </p>
                    <p
                      className={`text-3xl sm:text-4xl font-extrabold tabular-nums mt-1 ${
                        total < 0
                          ? 'text-red-700 dark:text-red-300'
                          : 'text-emerald-700 dark:text-emerald-300'
                      }`}
                    >
                      {fmtMoney(total)}
                    </p>
                  </div>
                  <div className="mt-auto grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={cart.length === 0 || submitting}
                      onClick={vaciarCarrito}
                      className="flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-2 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Trash2 size={18} />
                      Eliminar carrito
                    </button>
                    <button
                      type="button"
                      disabled={!puedeCobrar}
                      onClick={abrirCobrar}
                      className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-3 px-2 rounded-xl text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <CheckCircle size={18} />
                      Cobrar
                    </button>
                  </div>
                </aside>
              </div>
            )}
          </div>
      </div>
    </div>
  )
}

export default Ventas
