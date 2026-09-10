function esHostnameLocalOPrivado(hostname) {
  const h = String(hostname || '').toLowerCase()
  if (!h || h === 'localhost' || h === '127.0.0.1' || h === '::1') return true
  if (h.endsWith('.local')) return true
  if (h.startsWith('192.168.') || h.startsWith('10.')) return true
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true
  return false
}

export function esHostExterno() {
  if (typeof window === 'undefined') return false
  return !esHostnameLocalOPrivado(window.location.hostname)
}

export function esAccesoLimitado(user) {
  return (
    String(user?.rol || '').toUpperCase() === 'EXTERNO' ||
    user?.accesoExterno === true ||
    esHostExterno()
  )
}

/** Inicio según rol. Desde afuera no hay módulo de Ventas. */
export function rutaHome(user) {
  const admin = String(user?.rol || '').toUpperCase() === 'ADMIN'
  if (esAccesoLimitado(user)) return admin ? '/' : '/faltantes'
  return admin ? '/' : '/ventas'
}
