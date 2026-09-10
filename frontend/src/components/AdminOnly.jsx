import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { rutaHome } from '../utils/acceso'

const AdminOnly = ({ children }) => {
  const { user } = useAuth()
  if (user?.rol !== 'ADMIN') {
    return <Navigate to={rutaHome(user)} replace />
  }
  return children
}

export default AdminOnly
