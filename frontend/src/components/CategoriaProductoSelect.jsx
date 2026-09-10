import { useEffect, useState } from 'react'
import { productosAPI } from '../services/api'

const CategoriaProductoSelect = ({ productoId, categoriaId, categorias = [], onSaved, className = '' }) => {
  const [value, setValue] = useState(categoriaId == null || categoriaId === '' ? '' : String(categoriaId))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setValue(categoriaId == null || categoriaId === '' ? '' : String(categoriaId))
  }, [categoriaId, productoId])

  const handleChange = async (e) => {
    const next = e.target.value
    const prev = value
    setValue(next)
    if (!productoId) return
    setSaving(true)
    try {
      const { data } = await productosAPI.updateCategoria(
        productoId,
        next === '' ? null : Number(next)
      )
      onSaved?.(data)
    } catch (error) {
      console.error(error)
      setValue(prev)
      alert(error.response?.data?.error || 'No se pudo guardar la categoría')
    } finally {
      setSaving(false)
    }
  }

  return (
    <select
      value={value}
      disabled={saving || !productoId}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      className={`max-w-[14rem] px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white text-gray-800 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-100 disabled:opacity-60 ${className}`}
      title="Cambiar categoría"
    >
      <option value="">Sin categoría</option>
      {(Array.isArray(categorias) ? categorias : []).map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.nombre}
        </option>
      ))}
    </select>
  )
}

export default CategoriaProductoSelect
