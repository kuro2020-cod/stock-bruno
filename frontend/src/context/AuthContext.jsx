import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authAPI } from '../services/api'
import {
  leerTurnoCerradoSesion,
  guardarTurnoCerradoSesion,
  limpiarTurnoCerradoSesion
} from '../utils/turnoCajaSesion'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [cajaBloqueada, setCajaBloqueada] = useState(false)
  const [cierreTurno, setCierreTurno] = useState(null)

  const aplicarBloqueoSesion = useCallback((userId) => {
    const cierre = leerTurnoCerradoSesion(userId)
    setCajaBloqueada(!!cierre)
    setCierreTurno(cierre)
  }, [])

  const refreshEstadoCaja = useCallback(async () => {
    if (!user?.id) return
    aplicarBloqueoSesion(user.id)
  }, [user?.id, aplicarBloqueoSesion])

  useEffect(() => {
    let cancelled = false
    const raw = localStorage.getItem('auth')
    if (!raw) {
      setLoading(false)
      return undefined
    }
    try {
      const { token, user: u } = JSON.parse(raw)
      if (!token || !u) {
        localStorage.removeItem('auth')
        setLoading(false)
        return undefined
      }
      authAPI
        .me()
        .then(({ data }) => {
          if (cancelled) return
          const next = { ...u, ...data }
          setUser(next)
          localStorage.setItem('auth', JSON.stringify({ token, user: next }))
        })
        .catch(() => {
          if (!cancelled) setUser(u)
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })
    } catch {
      localStorage.removeItem('auth')
      setLoading(false)
    }
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!user) {
      setCajaBloqueada(false)
      setCierreTurno(null)
      return
    }
    aplicarBloqueoSesion(user.id)
  }, [user?.id, aplicarBloqueoSesion])

  const login = useCallback(async (usuario, clave) => {
    const { data } = await authAPI.login({ usuario, clave })
    const userData = { ...data.user, accesoExterno: Boolean(data.accesoExterno ?? data.user?.accesoExterno) }
    const payload = { token: data.token, user: userData }
    localStorage.setItem('auth', JSON.stringify(payload))
    limpiarTurnoCerradoSesion()
    setUser(userData)
    setCajaBloqueada(false)
    setCierreTurno(null)
  }, [])

  const logout = useCallback(() => {
    limpiarTurnoCerradoSesion()
    localStorage.removeItem('auth')
    setUser(null)
    setCajaBloqueada(false)
    setCierreTurno(null)
  }, [])

  const marcarCajaCerrada = useCallback(
    (cierre) => {
      if (user?.id) guardarTurnoCerradoSesion(user.id, cierre)
      setCajaBloqueada(true)
      if (cierre) setCierreTurno(cierre)
    },
    [user?.id]
  )

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        cajaBloqueada,
        cierreTurno,
        refreshEstadoCaja,
        marcarCajaCerrada
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return ctx
}
