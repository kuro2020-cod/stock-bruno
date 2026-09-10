import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { esAccesoLimitado } from '../utils/acceso'

const AdminOnly = ({ children }) => {
  const { user } = useAuth()
  if (esAccesoLimitado(user)) {
    return <Navigate to="/faltantes" replace />
  }
  if (user?.rol !== 'ADMIN') {
    return <Navigate to="/ventas" replace />
  }
  return children
}

export default AdminOnly
