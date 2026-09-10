import { useEffect, useRef, useState } from 'react'
import { Sparkles, Send, CheckCircle2, X, ChevronDown, Bot, User } from 'lucide-react'
import { asistenteAPI } from '../services/api'

const EJEMPLOS = [
  'Creá la categoría Coca Cola y meté los productos que digan Coca o Coca-Cola',
  'Pasá a Lácteos todo lo que diga leche, yogur o manteca',
  'Listá los productos sin categoría'
]

const Asistente = () => {
  const [estado, setEstado] = useState(null)
  const [texto, setTexto] = useState('')
  const [mensajes, setMensajes] = useState([])
  const [enviando, setEnviando] = useState(false)
  const [ejecutando, setEjecutando] = useState(false)
  const [planActivo, setPlanActivo] = useState(null)
  const [abiertos, setAbiertos] = useState(() => new Set())
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    asistenteAPI
      .estado()
      .then(({ data }) => setEstado(data))
      .catch(() => setEstado({ ia_configurada: false, proveedor: 'local' }))
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensajes, planActivo, enviando])

  const push = (msg) => setMensajes((prev) => [...prev, { id: Date.now() + Math.random(), ...msg }])

  const pedirPlan = async (frase) => {
    const pedido = String(frase || texto).trim()
    if (!pedido || enviando || ejecutando) return
    setTexto('')
    setPlanActivo(null)
    push({ rol: 'user', texto: pedido })
    setEnviando(true)
    try {
      const { data } = await asistenteAPI.plan(pedido)
      push({
        rol: 'asistente',
        texto: data.resumen || 'Revisá el plan.',
        pasos: data.pasos || [],
        modo: data.modo
      })
      if (data.requiere_confirmacion && data.plan_id) {
        setPlanActivo(data)
      }
    } catch (e) {
      push({
        rol: 'asistente',
        texto: e.response?.data?.error || 'No se pudo armar el plan.',
        error: true
      })
    } finally {
      setEnviando(false)
      inputRef.current?.focus()
    }
  }

  const confirmar = async () => {
    if (!planActivo?.plan_id || ejecutando) return
    setEjecutando(true)
    try {
      const { data } = await asistenteAPI.ejecutar(planActivo.plan_id)
      const lineas = (data.resultados || []).map((r) => r.detalle).filter(Boolean)
      push({
        rol: 'asistente',
        texto: lineas.length ? lineas.join('\n') : 'Listo, cambios aplicados.',
        ok: true
      })
      setPlanActivo(null)
    } catch (e) {
      push({
        rol: 'asistente',
        texto: e.response?.data?.error || 'No se pudo aplicar el plan.',
        error: true
      })
    } finally {
      setEjecutando(false)
    }
  }

  const cancelarPlan = () => {
    setPlanActivo(null)
    push({ rol: 'asistente', texto: 'Cancelado. No se cambió nada.' })
  }

  const togglePaso = (idx) => {
    setAbiertos((prev) => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx)
      else next.add(idx)
      return next
    })
  }

  const iaOk = Boolean(estado?.ia_configurada)

  return (
    <div className="flex flex-col min-h-[calc(100vh-6rem)]">
      <header className="page-header mb-4">
        <h2 className="page-title flex items-center gap-2">
          <Sparkles size={26} className="text-violet-600" />
          Asistente
        </h2>
        <p className="page-subtitle">
          Pedile tareas simples de catálogo (crear categoría, agrupar marcas). Siempre muestra el plan y espera tu
          confirmación.
        </p>
        {estado && (
          <p className="text-xs text-gray-500 mt-1">
            {iaOk
              ? `IA conectada (${estado.proveedor}).`
              : 'Modo básico: entiende frases directas. Para lenguaje más libre, configurá OPENAI_API_KEY o GEMINI_API_KEY en el .env del backend.'}
          </p>
        )}
      </header>

      <div className="flex flex-wrap gap-2 mb-4">
        {EJEMPLOS.map((ej) => (
          <button
            key={ej}
            type="button"
            onClick={() => pedirPlan(ej)}
            className="text-left text-xs sm:text-sm px-3 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-900 hover:bg-violet-100"
          >
            {ej}
          </button>
        ))}
      </div>

      <div className="flex-1 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col min-h-[28rem]">
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {mensajes.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-10">
              Escribí una tarea o tocá un ejemplo. No se cambia nada hasta que confirmes.
            </p>
          )}
          {mensajes.map((m) => (
            <div key={m.id} className={`flex gap-2 ${m.rol === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.rol !== 'user' && (
                <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-violet-100 text-violet-800 flex items-center justify-center">
                  <Bot size={16} />
                </span>
              )}
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap ${
                  m.rol === 'user'
                    ? 'bg-brand-600 text-white'
                    : m.error
                      ? 'bg-amber-50 border border-amber-200 text-amber-950'
                      : m.ok
                        ? 'bg-emerald-50 border border-emerald-200 text-emerald-950'
                        : 'bg-gray-50 border border-gray-200 text-gray-800'
                }`}
              >
                {m.texto}
                {Array.isArray(m.pasos) && m.pasos.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {m.pasos.map((p, i) => {
                      const open = abiertos.has(`${m.id}-${i}`)
                      const n = p.total ?? p.productos?.length ?? 0
                      return (
                        <div key={i} className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                          <p className="font-semibold text-gray-900">{p.titulo}</p>
                          <p className="text-xs text-gray-600 mt-0.5">{p.detalle}</p>
                          {p.productos?.length > 0 && (
                            <button
                              type="button"
                              onClick={() => togglePaso(`${m.id}-${i}`)}
                              className="mt-2 w-full flex items-center justify-between text-left text-xs font-bold uppercase tracking-wide text-violet-800"
                            >
                              <span>
                                Ver productos ({p.productos.length}
                                {n > p.productos.length ? ` de ${n}` : ''})
                              </span>
                              <ChevronDown
                                size={16}
                                className={`transition-transform ${open ? 'rotate-180' : ''}`}
                              />
                            </button>
                          )}
                          {open && (
                            <ul className="mt-2 max-h-40 overflow-y-auto text-xs space-y-1">
                              {p.productos.map((pr) => (
                                <li key={pr.id} className="flex justify-between gap-2">
                                  <span className="truncate">{pr.nombre}</span>
                                  <span className="shrink-0 text-gray-500">
                                    {pr.categoria_actual || 'sin cat.'}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
              {m.rol === 'user' && (
                <span className="shrink-0 mt-0.5 w-8 h-8 rounded-lg bg-brand-100 text-brand-800 flex items-center justify-center">
                  <User size={16} />
                </span>
              )}
            </div>
          ))}
          {enviando && <p className="text-xs text-gray-500 pl-10">Armando el plan…</p>}
          <div ref={bottomRef} />
        </div>

        {planActivo && (
          <div className="px-4 py-3 border-t border-violet-200 bg-violet-50 flex flex-wrap items-center gap-2">
            <p className="text-sm text-violet-950 font-medium flex-1">
              ¿Aplicar estos cambios? No se puede deshacer en un clic.
            </p>
            <button
              type="button"
              onClick={cancelarPlan}
              disabled={ejecutando}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-gray-300 text-gray-700 text-sm font-semibold hover:bg-white"
            >
              <X size={16} />
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmar}
              disabled={ejecutando}
              className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-violet-700 text-white text-sm font-semibold hover:bg-violet-800 disabled:opacity-50"
            >
              <CheckCircle2 size={16} />
              {ejecutando ? 'Aplicando…' : 'Confirmar'}
            </button>
          </div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault()
            pedirPlan()
          }}
          className="p-3 border-t border-gray-100 flex gap-2"
        >
          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ej. Creá la categoría Galletitas y meté lo que diga Oreo o Rumba"
            className="flex-1 px-3 py-2.5 border border-gray-300 rounded-xl text-sm"
            disabled={enviando || ejecutando}
          />
          <button
            type="submit"
            disabled={enviando || ejecutando || !texto.trim()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-violet-700 text-white font-semibold text-sm hover:bg-violet-800 disabled:opacity-50"
          >
            <Send size={16} />
            Enviar
          </button>
        </form>
      </div>
    </div>
  )
}

export default Asistente
