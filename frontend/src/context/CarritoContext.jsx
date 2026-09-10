import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react'
import { useAuth } from './AuthContext'
import {
  leerCarritoPersistido,
  guardarCarritoPersistido,
  limpiarCarritoPersistido
} from '../utils/carritoPersistencia'

const CarritoContext = createContext(null)

/**
 * Mantiene el carrito de Ventas al cambiar de página, refrescar, cerrar pestaña o cerrar sesión.
 * Se persiste en localStorage por usuario y se limpia al vaciar el carrito o completar una venta.
 */
export function CarritoProvider({ children }) {
  const { user } = useAuth()
  const [cart, setCart] = useState([])
  const [cartHydrated, setCartHydrated] = useState(false)
  const [restauradoDesdeStorage, setRestauradoDesdeStorage] = useState(false)
  const persistTimerRef = useRef(null)

  useEffect(() => {
    if (!user?.id) {
      setCart([])
      setCartHydrated(false)
      setRestauradoDesdeStorage(false)
      return
    }

    setCartHydrated(false)
    const guardado = leerCarritoPersistido(user.id)
    setCart(guardado)
    setRestauradoDesdeStorage(guardado.length > 0)
    setCartHydrated(true)
  }, [user?.id])

  useEffect(() => {
    if (!user?.id || !cartHydrated) return

    if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    persistTimerRef.current = setTimeout(() => {
      if (cart.length === 0) {
        limpiarCarritoPersistido(user.id)
      } else {
        guardarCarritoPersistido(user.id, cart)
      }
    }, 200)

    const flush = () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      if (cart.length === 0) {
        limpiarCarritoPersistido(user.id)
      } else {
        guardarCarritoPersistido(user.id, cart)
      }
    }

    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)

    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
    }
  }, [cart, user?.id, cartHydrated])

  const vaciarCarrito = useCallback(() => {
    if (user?.id) limpiarCarritoPersistido(user.id)
    setCart([])
    setRestauradoDesdeStorage(false)
  }, [user?.id])

  const marcarRestauracionVista = useCallback(() => {
    setRestauradoDesdeStorage(false)
  }, [])

  return (
    <CarritoContext.Provider
      value={{
        cart,
        setCart,
        vaciarCarrito,
        restauradoDesdeStorage,
        marcarRestauracionVista
      }}
    >
      {children}
    </CarritoContext.Provider>
  )
}

export function useCarrito() {
  const ctx = useContext(CarritoContext)
  if (!ctx) {
    throw new Error('useCarrito debe usarse dentro de CarritoProvider')
  }
  return ctx
}
