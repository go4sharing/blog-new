import { useEffect, useRef, useState } from 'react'
import { checkImageFile, fmtSize } from '../image'

/** 选择本地图片并预览；转换为 WebP 与上传在提交表单时进行 */
export default function ImagePicker({ label, hint, file, onChange }: { label: string; hint?: string; file: File | null; onChange: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!file) return setPreview('')
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const pick = (f: File | undefined) => {
    if (!f) return
    const e = checkImageFile(f)
    setErr(e ?? '')
    if (!e) onChange(f)
    if (ref.current) ref.current.value = ''
  }

  return (
    <div className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />

      {file ? (
        <div className="flex items-center gap-3 rounded-lg border border-line p-2">
          <img src={preview} alt="" className="h-16 w-24 rounded object-cover object-top" />
          <div className="min-w-0 flex-1 text-xs">
            <p className="truncate">{file.name}</p>
            <p className="text-muted">原图 {fmtSize(file.size)}，提交时自动转为 WebP</p>
          </div>
          <button type="button" onClick={() => onChange(null)} className="px-1 text-muted hover:text-red-500" aria-label="移除图片">
            ✕
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            pick(e.dataTransfer.files?.[0])
          }}
          className="flex h-20 w-full items-center justify-center rounded-lg border border-dashed border-line text-sm text-muted hover:bg-hover"
        >
          点击选择或拖入图片
        </button>
      )}
      {err ? <p className="text-xs text-red-500">{err}</p> : hint && <p className="text-xs text-muted">{hint}</p>}
    </div>
  )
}
