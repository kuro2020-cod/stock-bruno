import { useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { Boxes, Lock, Globe } from 'lucide-react'
import { esHostExterno } from '../utils/acceso'

const Login = () => {
  const { login } = useAuth()
  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const desdeInternet = esHostExterno()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await login(usuario.trim(), clave)
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'No se pudo iniciar sesión'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden">
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-900 via-brand-950 to-indigo-950"
        aria-hidden
      />
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 20%, rgba(99,102,241,0.4) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(79,70,229,0.35) 0%, transparent 45%)'
        }}
        aria-hidden
      />

      <div className="relative w-full max-w-md animate-slide-up">
        <div className="card p-6 sm:p-10 shadow-card border-white/20 bg-white/95 backdrop-blur-xl">
          <div className="flex flex-col items-center mb-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center shadow-glow mb-4">
              <Boxes className="text-white" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Control de Stock</h1>
            <p className="text-slate-500 text-sm mt-2">Iniciá sesión para continuar</p>
            {desdeInternet && (
              <p className="mt-3 text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-xl px-3 py-2 flex gap-2 text-left">
                <Globe size={14} className="shrink-0 mt-0.5" />
                <span>
                  Estás entrando por internet. Usá el mismo usuario del local. El módulo de
                  Ventas no va a estar disponible.
                </span>
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 text-rose-800 text-sm border border-rose-200 flex gap-2 items-start">
                <Lock size={16} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <div>
              <label htmlFor="login-usuario" className="label-field">
                Usuario
              </label>
              <input
                id="login-usuario"
                type="text"
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                required
                className="input-field !bg-white !border-slate-200 !text-slate-800 placeholder:!text-slate-400"
                placeholder="Tu nombre de usuario"
              />
            </div>
            <div>
              <label htmlFor="login-clave" className="label-field">
                Contraseña
              </label>
              <input
                id="login-clave"
                type="password"
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                autoComplete="current-password"
                required
                className="input-field !bg-white !border-slate-200 !text-slate-800 placeholder:!text-slate-400"
                placeholder="••••••••"
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary w-full py-3 text-base">
              {submitting ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </div>
        <p className="text-center text-slate-400 text-xs mt-6">Sistema de gestión de inventario y ventas</p>
      </div>
    </div>
  )
}

export default Login
