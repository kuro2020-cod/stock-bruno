import { useEffect, useState } from 'react'
import { usuariosAPI } from '../services/api'
import { Plus, Edit, Trash2, Users } from 'lucide-react'
import UsuarioModal from '../components/UsuarioModal'

const Usuarios = () => {
  const [usuarios, setUsuarios] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(null)
  const [showModal, setShowModal] = useState(false)
  const [selectedUsuario, setSelectedUsuario] = useState(null)

  useEffect(() => {
    loadUsuarios()
  }, [])

  const loadUsuarios = async () => {
    setLoadError(null)
    try {
      const response = await usuariosAPI.getAll()
      setUsuarios(Array.isArray(response.data) ? response.data : [])
    } catch (error) {
      console.error('Error al cargar usuarios:', error)
      const msg =
        error.response?.data?.error ||
        error.message ||
        'No se pudo cargar la lista. ¿El servidor está en marcha y la base es la misma que en pgAdmin?'
      setLoadError(msg)
      setUsuarios([])
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id) => {
    if (window.confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) {
      try {
        await usuariosAPI.delete(id)
        loadUsuarios()
      } catch (error) {
        console.error('Error al eliminar usuario:', error)
        const errorMessage = error.response?.data?.error || 'Error al eliminar el usuario'
        alert(errorMessage)
      }
    }
  }

  const handleEdit = (u) => {
    setSelectedUsuario(u)
    setShowModal(true)
  }

  const handleNew = () => {
    setSelectedUsuario(null)
    setShowModal(true)
  }

  const handleModalClose = () => {
    setShowModal(false)
    setSelectedUsuario(null)
    loadUsuarios()
  }

  if (loading) {
    return <div className="text-center py-12">Cargando usuarios...</div>
  }

  return (
    <div>
      <div className="page-toolbar">
        <h2 className="page-title">Usuarios</h2>
        <button
          type="button"
          onClick={handleNew}
          className="btn-primary"
        >
          <Plus size={20} />
          <span>Nuevo usuario</span>
        </button>
      </div>

      {loadError && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-800 rounded-lg text-sm">
          {loadError}
        </div>
      )}

      {!loadError && usuarios.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <Users className="mx-auto text-gray-400 mb-4" size={48} />
          <p className="text-gray-600">No hay usuarios registrados</p>
        </div>
      ) : !loadError ? (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Apellido y nombre
                  </th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden sm:table-cell">DNI</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rol</th>
                  <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase hidden md:table-cell">
                    Internet
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {usuarios.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {u.apellido}, {u.nombre}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-700 hidden sm:table-cell">{u.dni}</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-700">{u.usuario}</td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          u.rol === 'ADMIN'
                            ? 'bg-purple-100 text-purple-800'
                            : u.rol === 'EXTERNO'
                              ? 'bg-teal-100 text-teal-800'
                              : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {u.rol}
                      </span>
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-sm text-gray-700 hidden md:table-cell">
                      {u.acceso_externo === false ? 'No' : 'Sí'}
                    </td>
                    <td className="px-3 sm:px-6 py-3 sm:py-4 whitespace-nowrap text-center text-sm">
                      <button
                        type="button"
                        onClick={() => handleEdit(u)}
                        className="text-indigo-600 hover:text-indigo-900 p-2"
                        title="Editar"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(u.id)}
                        className="text-red-600 hover:text-red-900 p-2"
                        title="Eliminar"
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {showModal && <UsuarioModal usuario={selectedUsuario} onClose={handleModalClose} />}
    </div>
  )
}

export default Usuarios
