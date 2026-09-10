import { useState, useEffect } from 'react'
import { usuariosAPI } from '../services/api'
import { X } from 'lucide-react'

const emptyForm = {
  nombre: '',
  apellido: '',
  dni: '',
  usuario: '',
  clave: '',
  rol: 'USER',
  acceso_externo: true
}

const UsuarioModal = ({ usuario, onClose }) => {
  const [formData, setFormData] = useState(emptyForm)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (usuario) {
      setFormData({
        nombre: usuario.nombre || '',
        apellido: usuario.apellido || '',
        dni: usuario.dni || '',
        usuario: usuario.usuario || '',
        clave: '',
        rol: usuario.rol === 'ADMIN' ? 'ADMIN' : usuario.rol === 'EXTERNO' ? 'EXTERNO' : 'USER',
        acceso_externo: usuario.acceso_externo !== false && usuario.accesoExterno !== false
      })
    } else {
      setFormData(emptyForm)
    }
  }, [usuario])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        nombre: formData.nombre,
        apellido: formData.apellido,
        dni: formData.dni,
        usuario: formData.usuario,
        rol: formData.rol,
        acceso_externo: formData.acceso_externo
      }
      if (usuario) {
        if (formData.clave.trim()) {
          payload.clave = formData.clave
        }
        await usuariosAPI.update(usuario.id, payload)
      } else {
        if (!formData.clave.trim()) {
          alert('La clave es obligatoria para un usuario nuevo')
          setLoading(false)
          return
        }
        payload.clave = formData.clave
        await usuariosAPI.create(payload)
      }
      onClose()
    } catch (error) {
      console.error('Error al guardar usuario:', error)
      const errorMessage = error.response?.data?.error || 'Error al guardar el usuario'
      alert(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="modal-panel max-w-lg">
        <div className="flex justify-between items-center p-6 border-b sticky top-0 bg-white">
          <h3 className="text-xl font-semibold text-gray-800">
            {usuario ? 'Editar usuario' : 'Nuevo usuario'}
          </h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                name="nombre"
                value={formData.nombre}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Apellido *</label>
              <input
                type="text"
                name="apellido"
                value={formData.apellido}
                onChange={handleChange}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">DNI *</label>
            <input
              type="text"
              name="dni"
              value={formData.dni}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Usuario (login) *</label>
            <input
              type="text"
              name="usuario"
              value={formData.usuario}
              onChange={handleChange}
              required
              autoComplete="username"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {usuario ? 'Nueva clave (dejar vacío para no cambiar)' : 'Clave *'}
            </label>
            <input
              type="password"
              name="clave"
              value={formData.clave}
              onChange={handleChange}
              required={!usuario}
              autoComplete={usuario ? 'new-password' : 'new-password'}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Rol *</label>
            <select
              name="rol"
              value={formData.rol}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-transparent"
            >
              <option value="USER">USER — vendedor en el local</option>
              <option value="ADMIN">ADMIN — acceso completo</option>
              <option value="EXTERNO">EXTERNO — siempre sin Ventas</option>
            </select>
            {formData.rol === 'EXTERNO' && (
              <p className="mt-1 text-xs text-slate-500">
                Sin Ventas también en el local. ADMIN y USER pueden usar el mismo login desde
                internet: ahí Ventas se oculta sola.
              </p>
            )}
          </div>

          <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 cursor-pointer">
            <input
              type="checkbox"
              name="acceso_externo"
              checked={Boolean(formData.acceso_externo)}
              onChange={handleChange}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium text-gray-800">
                Permitir ingreso desde internet
              </span>
              <span className="block text-xs text-slate-500 mt-0.5">
                Si está marcado, este usuario puede entrar por el enlace de ngrok con el mismo
                usuario y clave. Desde afuera no ve Ventas.
              </span>
            </span>
          </label>

          <div className="flex justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default UsuarioModal
