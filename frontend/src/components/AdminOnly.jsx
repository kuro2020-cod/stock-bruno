import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { rutaHome } from '../utils/acceso'
import { esRolAdmin } from '../utils/roles'

const AdminOnly = ({ children }) => {
  const { user } = useAuth()
  if (!esRolAdmin(user?.rol)) {
    return <Navigate to={rutaHome(user)} replace />
  }
  return children
}

export default AdminOnly
