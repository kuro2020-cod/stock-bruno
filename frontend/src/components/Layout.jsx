import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ArrowLeftRight,
  ScanBarcode,
  BarChart3,
  ShoppingCart,
  Users,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Wallet,
  Tag,
  Lock,
  Boxes,
  Truck,
  PackageMinus,
  AlertTriangle,
  ClipboardList,
  ClipboardCheck,
  Banknote,
  BookUser,
  Landmark,
  ArrowDownToLine,
  Moon,
  Sun,
  Sparkles,
  ChevronDown,
  Settings,
  CalendarClock,
  Menu
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { fmtMoney, lineasTotalesCierre, lineasRubrosCierre, extraRubroCierre, claseMontoNeto, datosAperturaCierre } from '../utils/cierreCajaDisplay'
import ArqueoParcialModal from './ArqueoParcialModal'
import AlertaVencimientos from './AlertaVencimientos'
import { esAccesoLimitado } from '../utils/acceso'

const Layout = ({ children }) => {
  const location = useLocation()
  const { user, logout, cajaBloqueada: cajaSesion, cierreTurno } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const isAdmin = user?.rol === 'ADMIN'
  const limitado = esAccesoLimitado(user)
  const cajaBloqueada = !limitado && cajaSesion
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  )
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(min-width: 768px)').matches : true
  )
  const [showArqueo, setShowArqueo] = useState(false)
  const [openGroups, setOpenGroups] = useState({})

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => {
      setIsDesktop(mq.matches)
      setSidebarOpen(mq.matches)
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!isDesktop) setSidebarOpen(false)
  }, [location.pathname, isDesktop])

  const visibleItem = (item) => {
    if (item.hideIfLimitado && limitado) return false
    if (item.adminOnly) return isAdmin
    if (item.userOnly) return !isAdmin
    return true
  }

  const isPathActive = (path) => {
    if (cajaBloqueada) return false
    if (path === '/movimientos') {
      return location.pathname === '/movimientos' || location.pathname.startsWith('/movimientos/')
    }
    return location.pathname === path
  }

  const menuSections = [
    {
      items: [
        { path: '/', icon: LayoutDashboard, label: 'Dashboard', adminOnly: true },
        { path: '/ventas', icon: ShoppingCart, label: 'Ventas', hideIfLimitado: true }
      ]
    },
    {
      id: 'stock',
      label: 'Stock',
      icon: Package,
      children: [
        { path: '/carga-productos', icon: ScanBarcode, label: 'Carga de productos' },
        { path: '/pedidos', icon: ClipboardCheck, label: 'Pedidos' },
        { path: '/productos', icon: Package, label: 'Productos', adminOnly: true },
        { path: '/categorias', icon: FolderTree, label: 'Categorías', adminOnly: true },
        { path: '/baja-productos', icon: PackageMinus, label: 'Baja de productos', adminOnly: true },
        { path: '/promociones', icon: Tag, label: 'Promociones' },
        { path: '/vencimientos', icon: CalendarClock, label: 'Vencimientos' },
        { path: '/faltantes', icon: ClipboardList, label: 'Faltantes' },
        { path: '/incidencias', icon: AlertTriangle, label: 'Incidencias', adminOnly: true }
      ]
    },
    {
      id: 'caja',
      label: 'Caja',
      icon: Wallet,
      children: [
        { path: '/cierre-caja', icon: Wallet, label: 'Cierre de caja' },
        { path: '/retiros', icon: Banknote, label: 'Retiro efectivo' },
        { path: '/ingresos-efectivo', icon: ArrowDownToLine, label: 'Ingreso efectivo' },
        { path: '/pago-proveedores', icon: Truck, label: 'Pago proveedores' },
        { path: '/mercadopago', icon: Landmark, label: 'Mercado Pago' },
        { path: '/fiados', icon: BookUser, label: 'Fiados' }
      ]
    },
    {
      id: 'informes',
      label: 'Informes',
      icon: BarChart3,
      children: [
        { path: '/estadisticas', icon: BarChart3, label: 'Estadísticas', adminOnly: true },
        { path: '/movimientos', icon: ArrowLeftRight, label: 'Movimientos', adminOnly: true },
        { path: '/mis-ventas', icon: ArrowLeftRight, label: 'Mis movimientos', userOnly: true },
        { path: '/asistente', icon: Sparkles, label: 'Asistente', adminOnly: true }
      ]
    },
    {
      id: 'sistema',
      label: 'Sistema',
      icon: Settings,
      children: [{ path: '/usuarios', icon: Users, label: 'Usuarios', adminOnly: true }]
    }
  ]
    .map((section) => {
      if (section.children) {
        return { ...section, children: section.children.filter(visibleItem) }
      }
      return { ...section, items: (section.items || []).filter(visibleItem) }
    })
    .filter((section) => (section.children ? section.children.length > 0 : section.items.length > 0))

  useEffect(() => {
    setOpenGroups((prev) => {
      const next = { ...prev }
      for (const section of menuSections) {
        if (section.children?.some((item) => isPathActive(item.path))) {
          next[section.id] = true
        }
      }
      return next
    })
  }, [location.pathname, isAdmin])

  const displayName =
    user?.nombre && user?.apellido
      ? `${user.apellido}, ${user.nombre}`
      : user?.usuario || 'Usuario'

  const totalesCierre = lineasTotalesCierre(cierreTurno)
  const rubrosCierre = lineasRubrosCierre(cierreTurno)
  const aperturaCierre = datosAperturaCierre(cierreTurno)

  const navItemClass = (isActive) => {
    if (cajaBloqueada) {
      return 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 cursor-not-allowed opacity-50 w-full'
    }
    if (isActive) {
      return 'flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 text-white shadow-glow font-medium w-full'
    }
    return 'flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition-all duration-200 font-medium w-full'
  }

  const cerrarMenuMovil = () => {
    if (!isDesktop) setSidebarOpen(false)
  }

  const renderThemeToggle = () => (
    <button
      type="button"
      onClick={toggleTheme}
      className="shrink-0 p-2 rounded-lg text-slate-300 hover:text-amber-200 hover:bg-white/10 transition-colors"
      aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      title={isDark ? 'Modo claro' : 'Modo oscuro'}
    >
      {isDark ? <Sun size={18} className="text-amber-300" /> : <Moon size={18} />}
    </button>
  )

  return (
    <div
      className={`min-h-screen ${
        isDark
          ? 'bg-gradient-to-br from-slate-950 via-slate-950 to-slate-900'
          : 'bg-white'
      }`}
    >
      {!sidebarOpen && isDesktop && (
        <div className="fixed inset-y-0 left-0 z-50 w-14 hidden md:flex flex-col items-center border-r border-slate-800/50 bg-slate-900 pt-5 gap-2 shadow-xl print:hidden">
          <button
            type="button"
            onClick={() => !cajaBloqueada && setSidebarOpen(true)}
            disabled={cajaBloqueada}
            className="inline-flex items-center justify-center p-2.5 rounded-xl bg-white/10 text-slate-200 hover:bg-white/15 disabled:opacity-50"
            aria-label="Mostrar menú"
          >
            <PanelLeftOpen size={18} />
          </button>
          {renderThemeToggle()}
        </div>
      )}

      {sidebarOpen && !isDesktop && (
        <button
          type="button"
          className="modal-scrim fixed inset-0 z-40 print:hidden md:hidden"
          aria-label="Cerrar menú"
          onClick={cerrarMenuMovil}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 w-[17rem] max-w-[85vw] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 flex flex-col transition-transform duration-300 z-50 shadow-2xl print:hidden ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between gap-2 mb-3">
            {renderThemeToggle()}
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              aria-label="Ocultar menú"
            >
              <PanelLeftClose size={18} />
            </button>
          </div>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center shadow-glow">
                <Boxes className="text-white" size={22} />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-white leading-tight truncate">Control de Stock</h1>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {limitado ? 'Acceso remoto · sin Ventas' : 'Gestión integral'}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
            <p className="text-sm font-semibold text-white truncate" title={displayName}>
              {displayName}
            </p>
            <span
              className={`inline-block mt-2 ${
                user?.rol === 'EXTERNO' || limitado
                  ? 'badge-externo'
                  : isAdmin
                    ? 'badge-admin'
                    : 'badge-user'
              }`}
            >
              {user?.rol === 'EXTERNO'
                ? 'EXTERNO'
                : limitado
                  ? `${user?.rol} · remoto`
                  : user?.rol}
            </span>
            {cajaBloqueada && (
              <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-amber-300 bg-amber-500/20 border border-amber-400/30 px-2 py-1 rounded-lg">
                Turno cerrado
              </p>
            )}
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <button
            type="button"
            disabled={cajaBloqueada}
            onClick={() => !cajaBloqueada && setShowArqueo(true)}
            className="mb-3 w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-100 hover:bg-amber-500/25 font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ClipboardList size={18} className="shrink-0" />
            Arqueo parcial
          </button>
          <p className="px-3 mb-2 text-[10px] font-bold uppercase tracking-widest text-slate-500">Menú</p>
          {menuSections.map((section) => {
            const renderLink = (item) => {
              const Icon = item.icon
              const isActive = isPathActive(item.path)
              if (cajaBloqueada) {
                return (
                  <span key={item.path} className={navItemClass(false)} aria-disabled="true">
                    <Icon size={18} className="shrink-0 opacity-80" />
                    <span>{item.label}</span>
                  </span>
                )
              }
              return (
                <Link key={item.path} to={item.path} className={navItemClass(isActive)} onClick={cerrarMenuMovil}>
                  <Icon size={18} className="shrink-0 opacity-90" />
                  <span>{item.label}</span>
                </Link>
              )
            }

            if (!section.id) {
              return <div key="principales">{section.items.map(renderLink)}</div>
            }

            const GroupIcon = section.icon
            const abierto = Boolean(openGroups[section.id])
            const grupoActivo = section.children.some((item) => isPathActive(item.path))

            return (
              <div key={section.id} className="pt-1">
                <button
                  type="button"
                  disabled={cajaBloqueada}
                  onClick={() =>
                    setOpenGroups((prev) => ({ ...prev, [section.id]: !prev[section.id] }))
                  }
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl w-full font-medium transition-all duration-200 ${
                    cajaBloqueada
                      ? 'text-slate-500 cursor-not-allowed opacity-50'
                      : grupoActivo
                        ? 'text-white bg-white/10'
                        : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                  aria-expanded={abierto}
                >
                  <GroupIcon size={18} className="shrink-0 opacity-90" />
                  <span className="flex-1 text-left">{section.label}</span>
                  <ChevronDown
                    size={16}
                    className={`shrink-0 opacity-70 transition-transform ${abierto ? 'rotate-180' : ''}`}
                  />
                </button>
                {abierto && (
                  <div className="mt-1 ml-3 pl-2 border-l border-white/10 space-y-0.5">
                    {section.children.map((item) => {
                      const Icon = item.icon
                      const isActive = isPathActive(item.path)
                      if (cajaBloqueada) {
                        return (
                          <span
                            key={item.path}
                            className={`${navItemClass(false)} !py-2 text-sm`}
                            aria-disabled="true"
                          >
                            <Icon size={16} className="shrink-0 opacity-80" />
                            <span>{item.label}</span>
                          </span>
                        )
                      }
                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          className={`${navItemClass(isActive)} !py-2 text-sm`}
                          onClick={cerrarMenuMovil}
                        >
                          <Icon size={16} className="shrink-0 opacity-90" />
                          <span>{item.label}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="p-4 border-t border-white/10">
          <button
            type="button"
            onClick={() => {
              logout()
              window.location.href = '/login'
            }}
            className="btn-danger w-full py-3"
          >
            <LogOut size={18} />
            Cerrar sesión
          </button>
        </div>
      </aside>

      <div
        className={`min-h-screen min-w-0 overflow-x-hidden transition-all duration-300 print:ml-0 relative ${
          isDesktop ? (sidebarOpen ? 'ml-[17rem]' : 'ml-14') : 'ml-0'
        }`}
      >
        <header className="sticky top-0 z-30 flex items-center gap-3 px-3 py-2.5 border-b border-slate-200/80 bg-white/90 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/90 md:hidden print:hidden">
          <button
            type="button"
            onClick={() => !cajaBloqueada && setSidebarOpen(true)}
            disabled={cajaBloqueada}
            className="inline-flex items-center justify-center p-2 rounded-xl bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50"
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-50 truncate">Control de Stock</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{displayName}</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            className="shrink-0 p-2 rounded-lg text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
            aria-label={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
          >
            {isDark ? <Sun size={18} className="text-amber-400" /> : <Moon size={18} />}
          </button>
        </header>
        {cajaBloqueada && (
          <div className="modal-scrim absolute inset-0 z-30 flex items-start justify-center print:hidden p-4 pt-20 sm:p-6 sm:pt-16 overflow-y-auto">
            <div className="max-w-lg w-full card p-5 sm:p-8 text-center shadow-card animate-slide-up border-amber-200/60 dark:border-amber-500/30">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center mb-4">
                <Lock className="text-amber-600 dark:text-amber-300" size={28} />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">Cierre de caja registrado</h2>
              <p className="text-slate-600 dark:text-slate-300 mt-2 text-sm leading-relaxed">
                Tu turno quedó finalizado. No podés operar ventas ni otras acciones hasta cerrar sesión.
              </p>
              {cierreTurno?.created_at && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  Cierre:{' '}
                  {new Date(cierreTurno.created_at).toLocaleString('es-AR', {
                    dateStyle: 'short',
                    timeStyle: 'short'
                  })}
                </p>
              )}
              {(totalesCierre.length > 0 || rubrosCierre.length > 0 || aperturaCierre) && (
                <div className="mt-5 text-left rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/80 dark:bg-slate-800/80 p-4 space-y-1.5">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-200 uppercase tracking-wide text-center mb-2">
                    Totales de este turno
                  </p>
                  {aperturaCierre && (
                    <div className="mb-2 pb-2 border-b border-slate-200 dark:border-slate-600 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300 mb-1">
                        Caja
                      </p>
                      {aperturaCierre.montoApertura != null && (
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="text-slate-600 dark:text-slate-300">Apertura de caja</span>
                          <span className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                            {fmtMoney(aperturaCierre.montoApertura)}
                          </span>
                        </div>
                      )}
                      {aperturaCierre.fondoSiguiente != null && (
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="text-slate-600 dark:text-slate-300">Cierre / fondo dejado</span>
                          <span className="font-semibold tabular-nums text-emerald-800 dark:text-emerald-300">
                            {fmtMoney(aperturaCierre.fondoSiguiente)}
                          </span>
                        </div>
                      )}
                      {aperturaCierre.diferencia != null && aperturaCierre.diferencia !== 0 && (
                        <div className="flex justify-between gap-3 text-sm">
                          <span className="text-slate-600 dark:text-slate-300">Ajuste al efectivo</span>
                          <span
                            className={`font-semibold tabular-nums ${claseMontoNeto(aperturaCierre.diferencia)}`}
                          >
                            {aperturaCierre.diferencia > 0 ? '+' : ''}
                            {fmtMoney(aperturaCierre.diferencia)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  {totalesCierre.map(({ key, label, total, ventas, proveedores }) => (
                    <div key={key} className="text-sm">
                      <div className="flex justify-between gap-3">
                        <span className="text-slate-600 dark:text-slate-300">{label}</span>
                        <span
                          className={`font-semibold tabular-nums ${
                            Number(total) === 0
                              ? 'text-slate-800 dark:text-slate-100'
                              : claseMontoNeto(total)
                          }`}
                        >
                          {fmtMoney(total)}
                        </span>
                      </div>
                      {(ventas > 0 || proveedores > 0) && (
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 text-right">
                          Ventas {fmtMoney(ventas)} · Prov. -{fmtMoney(proveedores).replace('$', '')}
                        </p>
                      )}
                    </div>
                  ))}
                  {rubrosCierre.length > 0 && (
                    <div className="pt-2 mt-2 border-t border-slate-200 dark:border-slate-600 space-y-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-wide text-violet-700 dark:text-violet-300 mb-1">
                        Rubros
                      </p>
                      {rubrosCierre.map((rubro) => {
                        const { key, label, total, movimientos, unidades } = rubro
                        const u = Number(unidades) || 0
                        const esCafe = key === 'cafe_maquina'
                        const extra = extraRubroCierre(rubro)
                        return (
                          <div key={key} className="flex justify-between gap-3 text-sm">
                            <span className="text-slate-600 dark:text-slate-300">{label}</span>
                            <span className="font-semibold tabular-nums text-violet-900 dark:text-violet-200 text-right">
                              {fmtMoney(total)}
                              <span className="ml-1 text-[10px] font-normal text-slate-500 dark:text-slate-400 block sm:inline">
                                ({movimientos} mov.
                                {u > 0
                                  ? ` · ${u.toLocaleString('es-ES', { maximumFractionDigits: 3 })} ${
                                      esCafe ? 'café(s)' : 'u.'
                                    }`
                                  : esCafe
                                    ? ' · 0 cafés'
                                    : ''}
                                )
                              </span>
                              {extra ? (
                                <span className="block text-[10px] font-normal text-rose-700 dark:text-rose-300">
                                  {extra}
                                </span>
                              ) : null}
                            </span>
                          </div>
                        )
                      })}
                      {(() => {
                        const cafeMes = (() => {
                          try {
                            const d =
                              typeof cierreTurno?.detalle_metodos === 'string'
                                ? JSON.parse(cierreTurno.detalle_metodos)
                                : cierreTurno?.detalle_metodos
                            return d?.cafe_maquina_mes || null
                          } catch {
                            return null
                          }
                        })()
                        if (!cafeMes) return null
                        return (
                          <div
                            className={`mt-2 rounded-lg border px-2.5 py-2 text-xs ${
                              cafeMes.exceso
                                ? 'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-500/50 dark:bg-rose-950/50 dark:text-rose-200'
                                : 'border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-200'
                            }`}
                          >
                            <p className="font-bold uppercase tracking-wide">
                              Café máquina del mes
                              {cafeMes.exceso ? ' · Exceso' : ''}
                            </p>
                            <p className="tabular-nums font-semibold mt-0.5">
                              {Number(cafeMes.unidades || 0).toLocaleString('es-ES', {
                                maximumFractionDigits: 3
                              })}{' '}
                              / {Number(cafeMes.umbral || 400).toLocaleString('es-ES')} u.
                            </p>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                  <div className="flex justify-between gap-3 text-sm pt-2 mt-2 border-t border-slate-200 dark:border-slate-600 font-bold">
                    <span className="text-slate-800 dark:text-slate-100">Neto del día</span>
                    <span
                      className={`tabular-nums ${
                        Number(cierreTurno?.total_general || 0) === 0
                          ? 'text-slate-800 dark:text-slate-100'
                          : claseMontoNeto(cierreTurno?.total_general)
                      }`}
                    >
                      {fmtMoney(cierreTurno?.total_general)}
                    </span>
                  </div>
                </div>
              )}
              <p className="text-sm text-emerald-700 dark:text-emerald-300 font-medium mt-4">
                Otro usuario puede iniciar sesión y seguir trabajando el mismo día.
              </p>
              <button
                type="button"
                onClick={() => {
                  logout()
                  window.location.href = '/login'
                }}
                className="btn-danger mt-6 px-6"
              >
                <LogOut size={18} />
                Cerrar sesión
              </button>
            </div>
          </div>
        )}

        <main
          className={`p-3 sm:p-6 lg:p-10 max-w-[1600px] mx-auto min-w-0 animate-fade-in ${
            cajaBloqueada ? 'pointer-events-none select-none opacity-40' : ''
          }`}
        >
          {!cajaBloqueada && <AlertaVencimientos />}
          {children}
        </main>
      </div>

      <ArqueoParcialModal open={showArqueo} onClose={() => setShowArqueo(false)} />
    </div>
  )
}

export default Layout
