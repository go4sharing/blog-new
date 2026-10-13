import { useEffect, useState } from 'react'
import { fetchReactions, postJson, type ReactionState } from '../api'

/** Telegram 风格表情回应：有计数的表情显示为胶囊，点 + 选择更多；每人只能选一个，再点取消 */
export default function Reactions({ id }: { id: string }) {
  const [s, setS] = useState<ReactionState | null>(null)
  const [open, setOpen] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    setS(null)
    setOpen(false)
    fetchReactions(id).then(setS)
  }, [id])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    const t = setTimeout(() => document.addEventListener('click', close), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('click', close)
    }
  }, [open])

  if (!s) return null

  const react = async (emoji: string) => {
    setOpen(false)
    setErr('')
    const prev = s
    // 乐观更新：先改界面，失败再回滚
    const counts = { ...s.counts }
    if (s.mine) counts[s.mine] = Math.max(0, (counts[s.mine] ?? 0) - 1)
    const mine = s.mine === emoji ? null : emoji
    if (mine) counts[mine] = (counts[mine] ?? 0) + 1
    setS({ ...s, counts, mine })

    const r = await postJson(`/api/airports/${encodeURIComponent(id)}/reactions`, { emoji })
    if (r.ok) setS(r.data)
    else {
      setS(prev)
      setErr(r.data.error || '操作失败')
    }
  }

  const shown = s.emojis.filter((e) => (s.counts[e] ?? 0) > 0)

  return (
    <div className="relative flex flex-wrap items-center gap-1.5">
      {shown.map((e) => {
        const active = s.mine === e
        return (
          <button
            key={e}
            type="button"
            onClick={() => react(e)}
            aria-pressed={active}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-sm transition active:scale-90 ${
              active ? 'border-accent bg-accent/15 font-medium text-accent' : 'border-line hover:bg-hover'
            }`}
          >
            <span>{e}</span>
            <span className="text-xs tabular-nums">{s.counts[e]}</span>
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="添加表情"
        title="添加表情"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-line text-sm text-muted hover:bg-hover hover:text-fg"
      >
        {shown.length ? '+' : '☺'}
      </button>
      {!shown.length && !open && <span className="text-xs text-muted">来个表情回应吧</span>}

      {open && (
        <div className="absolute left-0 top-full z-10 mt-1.5 flex gap-1 rounded-full border border-line bg-card p-1.5 shadow-lg">
          {s.emojis.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => react(e)}
              className={`flex h-9 w-9 items-center justify-center rounded-full text-xl transition hover:scale-125 hover:bg-hover ${s.mine === e ? 'bg-accent/15' : ''}`}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      {err && <span className="w-full text-xs text-red-500">{err}</span>}
    </div>
  )
}
