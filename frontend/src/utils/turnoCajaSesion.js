const STORAGE_KEY = 'turno_caja_cerrado'

/** Bloqueo de UI solo en esta sesión del navegador (hasta cerrar sesión). */
export function leerTurnoCerradoSesion(userId) {
  if (!userId) return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (Number(data?.userId) !== Number(userId)) return null
    return data.cierre || null
  } catch {
    return null
  }
}

export function guardarTurnoCerradoSesion(userId, cierre) {
  if (!userId) return
  sessionStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ userId: Number(userId), cierre, at: Date.now() })
  )
}

export function limpiarTurnoCerradoSesion() {
  sessionStorage.removeItem(STORAGE_KEY)
}
