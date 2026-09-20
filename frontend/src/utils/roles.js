export function normalizeRol(rol) {
  const r = String(rol || '')
    .trim()
    .toUpperCase()
  if (r === 'SUPER') return 'SUPER'
  if (r === 'ADMIN') return 'ADMIN'
  if (r === 'EXTERNO') return 'EXTERNO'
  return 'USER'
}

export function esRolAdmin(rol) {
  const r = normalizeRol(rol)
  return r === 'ADMIN' || r === 'SUPER'
}

export function esRolSuper(rol) {
  return normalizeRol(rol) === 'SUPER'
}

/** Etiqueta pública: SUPER se muestra como ADMIN. */
export function rolVisible(rol) {
  const r = normalizeRol(rol)
  return r === 'SUPER' ? 'ADMIN' : r
}
