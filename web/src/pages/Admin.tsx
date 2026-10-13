import { useEffect, useState } from 'react'
import { apiUrl, HAS_API, postJson } from '../api'
import { PendingAirportCard, PendingCommentCard, type PendingAirport, type PendingComment } from '../components/PendingCards'
import { normalizeAirport } from '../lib'
import type { Airport } from '../types'

const TEMPLATE = JSON.stringify(
  {
    id: 'my-airport',
    name: '名称',
    desc: '一句话简介',
    tags: ['value', 'relay'],
    website: 'https://example.com',
    aff: '',
    freeCode: '',
    notes: [],
    speedtestImage: '',
    speedtestAt: '',
    topologyImage: '',
    plans: [{ name: '基础', price: 15, period: 'month', traffic: '200GB', nodes: '20', devices: 3 }],
    protocols: ['Trojan'],
    unlock: ['Netflix'],
    contacts: { channel: '', group: '', support: '' },
    status: 'ok',
    foundedAt: '2023-05',
    discoveredAt: '',
    source: 'manual',
  },
  null,
  2,
)

export default function Admin() {
  useEffect(() => {
    const m = document.createElement('meta')
    m.name = 'robots'
    m.content = 'noindex,nofollow'
    document.head.appendChild(m)
    return () => m.remove()
  }, [])

  const [token, setToken] = useState(localStorage.getItem('admin_token') ?? '')
  const [text, setText] = useState(TEMPLATE)
  const [out, setOut] = useState('')
  const [pending, setPending] = useState<{ airports: PendingAirport[]; comments: PendingComment[] } | null>(null)
  const [busy, setBusy] = useState('')

  // 之前登录过：进入页面自动加载一次
  useEffect(() => {
    if (HAS_API && token) loadPending()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!HAS_API) return <p className="py-10 text-center text-sm text-muted">当前为纯静态部署，没有后端，管理功能不可用。</p>

  const airports = pending?.airports ?? []
  const comments = pending?.comments ?? []

  const auth = () => ({ Authorization: `Bearer ${token}` })
  const save = () => localStorage.setItem('admin_token', token)

  const submit = async () => {
    save()
    let body: unknown
    try { body = JSON.parse(text) } catch { return setOut('JSON 格式错误') }
    const r = await postJson('/api/admin/airports', body, auth())
    setOut(r.ok ? JSON.stringify(r.data, null, 2) : r.data.error || JSON.stringify(r.data))
  }

  const loadPending = async () => {
    save()
    try {
      const r = await fetch(apiUrl('/api/admin/pending'), { headers: auth() })
      if (r.ok) {
        const j = await r.json()
        setPending({ airports: (j.airports as PendingAirport[]).map((a) => ({ ...normalizeAirport(a), submittedAt: a.submittedAt })), comments: j.comments })
        setOut('')
      } else {
        setPending(null)
        const d = await r.json().catch(() => ({}))
        setOut(d.error || `获取失败：${r.status}`)
      }
    } catch {
      setOut('网络错误，无法连接服务器')
    }
  }

  const act = async (key: string, url: string, method: string, body?: unknown) => {
    setBusy(key)
    try {
      const r = await fetch(apiUrl(url), { method, headers: { 'Content-Type': 'application/json', ...auth() }, body: body ? JSON.stringify(body) : undefined })
      if (!r.ok) {
        const d = await r.json().catch(() => ({}))
        return setOut(d.error || `操作失败：${r.status}`)
      }
      // 操作成功：直接从列表移除，不必等整页重新加载
      setPending((p) =>
        p && {
          airports: p.airports.filter((a) => a.id !== key),
          comments: p.comments.filter((c) => `c${c.id}` !== key),
        },
      )
      setOut('')
    } catch {
      setOut('网络错误，操作未完成')
    } finally {
      setBusy('')
    }
  }

  // 审核时修改并保存；publish 为 true 时同时通过。返回错误信息，成功返回 null
  const saveEdit = async (next: Airport, publish: boolean): Promise<string | null> => {
    try {
      const r = await fetch(apiUrl(`/api/admin/airports/${next.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...auth() },
        body: JSON.stringify({ airport: next, publish }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) return d.error || `保存失败：${r.status}`
      setPending((p) =>
        p && {
          ...p,
          airports: publish
            ? p.airports.filter((a) => a.id !== next.id)
            : p.airports.map((a) => (a.id === next.id ? { ...normalizeAirport(d.airport), submittedAt: d.airport.submittedAt } : a)),
        },
      )
      setOut('')
      return null
    } catch {
      return '网络错误，保存未完成'
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">管理后台</h1>
      <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="ADMIN_TOKEN"
        className="w-full max-w-sm rounded border border-line bg-transparent px-2.5 py-1.5 text-sm" />
      {out && <pre className="whitespace-pre-wrap rounded bg-hover p-2 text-xs">{out}</pre>}

      {/* 待审核是最常用的操作，显示在录入框上方 */}
      <div className="order-last space-y-2">
        <h2 className="text-lg font-semibold">快速录入</h2>
        <p className="text-sm text-muted">粘贴单个对象或数组（爬虫结果也可直接粘贴），按 id 覆盖更新。</p>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={18}
          className="w-full rounded border border-line bg-transparent p-2 font-mono text-xs" />
        <div className="flex gap-2">
          <button onClick={submit} className="rounded bg-accent px-4 py-1.5 text-sm text-white">保存</button>
          <button onClick={() => setText(TEMPLATE)} className="rounded border border-line px-4 py-1.5 text-sm">重置模板</button>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">待审核</h2>
          {pending && (
            <span className="rounded-full bg-hover px-2 py-0.5 text-xs text-muted">
              机场 {airports.length} · 评论 {comments.length}
            </span>
          )}
          <button onClick={loadPending} className="ml-auto rounded border border-line px-3 py-1 text-sm hover:bg-hover">
            刷新
          </button>
        </div>

        {!pending && <p className="py-6 text-center text-sm text-muted">输入 ADMIN_TOKEN 后点击“刷新”加载待审核内容。</p>}
        {pending && !airports.length && !comments.length && <p className="py-6 text-center text-sm text-muted">没有待审核的内容 🎉</p>}

        {airports.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted">投稿机场</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {airports.map((a) => (
                <PendingAirportCard
                  key={a.id}
                  a={a}
                  busy={busy === a.id}
                  onApprove={() => act(a.id, `/api/admin/airports/${a.id}/status`, 'POST', { status: 'published' })}
                  onDelete={() => act(a.id, `/api/admin/airports/${a.id}`, 'DELETE')}
                  onSave={saveEdit}
                />
              ))}
            </div>
          </div>
        )}

        {comments.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-muted">评论</h3>
            <div className="grid gap-3 md:grid-cols-2">
              {comments.map((c) => (
                <PendingCommentCard
                  key={c.id}
                  c={c}
                  busy={busy === `c${c.id}`}
                  onApprove={() => act(`c${c.id}`, `/api/admin/comments/${c.id}/status`, 'POST', { status: 'approved' })}
                  onReject={() => act(`c${c.id}`, `/api/admin/comments/${c.id}/status`, 'POST', { status: 'rejected' })}
                />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
