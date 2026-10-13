import { lazy, Suspense, useState, type ReactNode } from 'react'
import { PERIOD_LABEL, TAGS, TAG_KEYS, planText } from '../lib'
import type { Airport, Period, Tag } from '../types'
import { CopyButton, TagBadge, TelegramIcon } from './ui'

const ImageLightbox = lazy(() => import('./ImageLightbox'))

export type PendingAirport = Airport & { submittedAt?: string }
export interface PendingComment {
  id: number
  airport_id: string
  airport_name?: string | null
  nickname: string
  content: string
  rating: number
  created_at: string
}

const fmtTime = (iso?: string) => (iso ? iso.replace('T', ' ').slice(0, 16) : '')
const PERIODS = Object.keys(PERIOD_LABEL) as Period[]
const inp = 'w-full rounded border border-line bg-transparent px-2 py-1 text-sm outline-none focus:border-accent'

function Thumb({ src, label, onOpen }: { src?: string; label: string; onOpen: () => void }) {
  if (!src) {
    return (
      <div className="flex h-24 flex-1 items-center justify-center rounded-md border border-dashed border-line text-xs text-muted">无{label}</div>
    )
  }
  return (
    <button type="button" onClick={onOpen} title={`点击放大${label}`} className="group relative h-24 flex-1 cursor-zoom-in overflow-hidden rounded-md border border-line bg-hover">
      <img src={src} alt={label} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
      <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{label}</span>
    </button>
  )
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 text-sm">
      <dt className="w-14 shrink-0 text-muted">{k}</dt>
      <dd className="min-w-0 flex-1 break-all">{children}</dd>
    </div>
  )
}

/** 二次确认的危险按钮：第一次点击变成“确认删除？”，3 秒内再点才执行 */
function DangerButton({ label, confirmLabel, onConfirm }: { label: string; confirmLabel: string; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        if (armed) return onConfirm()
        setArmed(true)
        setTimeout(() => setArmed(false), 3000)
      }}
      className={`rounded border px-3 py-1.5 text-sm transition ${armed ? 'border-red-500 bg-red-500 text-white' : 'border-line text-red-500 hover:bg-hover'}`}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}

function F({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-0.5">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </label>
  )
}

// ---------------------------------------------------------------- 编辑表单

interface PlanDraft {
  name: string
  price: string
  period: Period
  traffic: string
  nodes: string
  devices?: number
}
interface Draft {
  name: string
  desc: string
  tags: Tag[]
  website: string
  freeCode: string
  foundedAt: string
  notes: string
  support: string
  group: string
  channel: string
  speed: string
  topo: string
  plans: PlanDraft[]
}

const toDraft = (a: PendingAirport): Draft => ({
  name: a.name,
  desc: a.desc ?? '',
  tags: [...a.tags],
  website: a.website,
  freeCode: a.freeCode ?? '',
  foundedAt: a.foundedAt ?? '',
  notes: (a.notes ?? []).join('\n'),
  support: a.contacts.support ?? '',
  group: a.contacts.group ?? '',
  channel: a.contacts.channel ?? '',
  speed: a.speedtestImage ?? '',
  topo: a.topologyImage ?? '',
  plans: a.plans.map((p) => ({ name: p.name, price: String(p.price), period: p.period, traffic: p.traffic, nodes: p.nodes ?? '', devices: p.devices })),
})

function fromDraft(a: PendingAirport, d: Draft): Airport {
  const contacts: Airport['contacts'] = {}
  if (d.channel.trim()) contacts.channel = d.channel.trim()
  if (d.group.trim()) contacts.group = d.group.trim()
  if (d.support.trim()) contacts.support = d.support.trim()
  return {
    ...a,
    name: d.name.trim(),
    desc: d.desc.trim(),
    tags: TAG_KEYS.filter((t) => d.tags.includes(t)),
    website: d.website.trim(),
    freeCode: d.freeCode.trim() || undefined,
    foundedAt: d.foundedAt.trim() || undefined,
    notes: d.notes.split('\n').map((s) => s.trim()).filter(Boolean),
    contacts,
    speedtestImage: d.speed.trim() || undefined,
    topologyImage: d.topo.trim() || undefined,
    plans: d.plans.map((p) => ({
      name: p.name.trim(),
      price: Number(p.price) || 0,
      period: p.period,
      traffic: p.traffic.trim(),
      nodes: p.nodes.trim() || undefined,
      devices: p.devices,
    })),
  }
}

function EditForm({
  a,
  onCancel,
  onSave,
}: {
  a: PendingAirport
  onCancel: () => void
  onSave: (next: Airport, publish: boolean) => Promise<string | null>
}) {
  const [d, setD] = useState<Draft>(() => toDraft(a))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }))
  const setPlan = (i: number, patch: Partial<PlanDraft>) => set('plans', d.plans.map((p, j) => (j === i ? { ...p, ...patch } : p)))

  const save = async (publish: boolean) => {
    setSaving(true)
    setErr('')
    const e = await onSave(fromDraft(a, d), publish)
    setSaving(false)
    if (e) setErr(e)
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <F label="名称">
          <input value={d.name} maxLength={40} onChange={(e) => set('name', e.target.value)} className={inp} />
        </F>
        <F label="创建时间（YYYY-MM）">
          <input value={d.foundedAt} placeholder="2023-05" onChange={(e) => set('foundedAt', e.target.value)} className={inp} />
        </F>
      </div>

      <F label="简介">
        <textarea value={d.desc} maxLength={200} rows={2} onChange={(e) => set('desc', e.target.value)} className={inp} />
      </F>

      <div className="space-y-1">
        <span className="text-xs text-muted">标签</span>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {TAG_KEYS.map((t) => (
            <label key={t} title={TAGS[t].desc} className="flex items-center gap-1 text-sm">
              <input type="checkbox" checked={d.tags.includes(t)} onChange={(e) => set('tags', e.target.checked ? [...d.tags, t] : d.tags.filter((x) => x !== t))} />
              {TAGS[t].label}
            </label>
          ))}
        </div>
      </div>

      <F label="注册页">
        <input value={d.website} onChange={(e) => set('website', e.target.value)} className={inp} />
      </F>

      <div className="space-y-1.5">
        <span className="text-xs text-muted">套餐（名称 / 价格 / 周期 / 流量 / 节点数）</span>
        {d.plans.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-1.5">
            <input value={p.name} maxLength={30} aria-label="套餐名称" onChange={(e) => setPlan(i, { name: e.target.value })} className={`${inp} w-24!`} />
            <input value={p.price} type="number" min={0} step="0.01" aria-label="价格" onChange={(e) => setPlan(i, { price: e.target.value })} className={`${inp} w-20!`} />
            <select value={p.period} aria-label="周期" onChange={(e) => setPlan(i, { period: e.target.value as Period })} className="rounded border border-line bg-bg px-1.5 py-1 text-sm">
              {PERIODS.map((k) => (
                <option key={k} value={k}>
                  /{PERIOD_LABEL[k]}
                </option>
              ))}
            </select>
            <input value={p.traffic} maxLength={30} aria-label="流量" onChange={(e) => setPlan(i, { traffic: e.target.value })} className={`${inp} min-w-24 flex-1`} />
            <input value={p.nodes} placeholder="节点" aria-label="节点数" onChange={(e) => setPlan(i, { nodes: e.target.value })} className={`${inp} w-16!`} />
            {d.plans.length > 1 && (
              <button type="button" onClick={() => set('plans', d.plans.filter((_, j) => j !== i))} className="px-1 text-muted hover:text-red-500" aria-label="删除套餐">
                ✕
              </button>
            )}
          </div>
        ))}
        {d.plans.length < 10 && (
          <button type="button" onClick={() => set('plans', [...d.plans, { name: `套餐${d.plans.length + 1}`, price: '', period: 'month', traffic: '', nodes: '' }])} className="text-sm text-accent">
            + 添加套餐
          </button>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <F label="客服链接">
          <input value={d.support} onChange={(e) => set('support', e.target.value)} className={inp} />
        </F>
        <F label="群组链接">
          <input value={d.group} onChange={(e) => set('group', e.target.value)} className={inp} />
        </F>
        <F label="频道链接">
          <input value={d.channel} onChange={(e) => set('channel', e.target.value)} className={inp} />
        </F>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <F label="测速图地址（https）">
          <input value={d.speed} onChange={(e) => set('speed', e.target.value)} className={inp} />
        </F>
        <F label="拓扑图地址（https）">
          <input value={d.topo} onChange={(e) => set('topo', e.target.value)} className={inp} />
        </F>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <F label="白嫖码">
          <input value={d.freeCode} maxLength={30} onChange={(e) => set('freeCode', e.target.value)} className={inp} />
        </F>
        <F label="备注（每行一条）">
          <textarea value={d.notes} rows={2} onChange={(e) => set('notes', e.target.value)} className={inp} />
        </F>
      </div>

      {err && <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-300">{err}</p>}

      <div className="flex justify-end gap-2 border-t border-line pt-3">
        <button type="button" disabled={saving} onClick={onCancel} className="rounded border border-line px-3 py-1.5 text-sm hover:bg-hover">
          取消
        </button>
        <button type="button" disabled={saving} onClick={() => save(false)} className="rounded border border-accent px-3 py-1.5 text-sm text-accent hover:bg-hover disabled:opacity-60">
          {saving ? '保存中…' : '保存'}
        </button>
        <button type="button" disabled={saving} onClick={() => save(true)} className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
          保存并通过
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- 卡片

export function PendingAirportCard({
  a,
  busy,
  onApprove,
  onDelete,
  onSave,
}: {
  a: PendingAirport
  busy: boolean
  onApprove: () => void
  onDelete: () => void
  /** 返回错误信息；成功返回 null */
  onSave: (next: Airport, publish: boolean) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [preview, setPreview] = useState<number | null>(null)
  const slides = [
    a.speedtestImage && { key: 'speed', src: a.speedtestImage, title: `${a.name} · 测速图` },
    a.topologyImage && { key: 'topo', src: a.topologyImage, title: `${a.name} · 拓扑图` },
  ].filter(Boolean) as { key: string; src: string; title: string }[]
  const open = (key: string) => setPreview(Math.max(0, slides.findIndex((s) => s.key === key)))

  const contacts = [
    ['频道', a.contacts.channel],
    ['群组', a.contacts.group],
    ['客服', a.contacts.support],
  ].filter(([, u]) => u) as [string, string][]

  const warn: string[] = []
  if (!a.speedtestImage) warn.push('没有测速图')
  if (!contacts.length) warn.push('没有联系方式')
  if (a.website && !/^https:\/\//.test(a.website)) warn.push('注册地址不是 https')

  return (
    <article className={`flex flex-col gap-3 rounded-lg border bg-card p-4 ${editing ? 'border-accent md:col-span-2' : 'border-line'}`}>
      {preview !== null && (
        <Suspense fallback={null}>
          <ImageLightbox slides={slides} index={preview} onClose={() => setPreview(null)} />
        </Suspense>
      )}

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold">{a.name}</h3>
          <p className="text-xs text-muted">{a.submittedAt ? `提交于 ${fmtTime(a.submittedAt)}` : ''}</p>
        </div>
        <span className="shrink-0 rounded bg-yellow-100 px-2 py-0.5 text-xs text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300">
          {editing ? '编辑中' : '待审核'}
        </span>
      </header>

      <div className="flex gap-2">
        <Thumb src={a.speedtestImage} label="测速图" onOpen={() => open('speed')} />
        <Thumb src={a.topologyImage} label="拓扑图" onOpen={() => open('topo')} />
      </div>

      {editing ? (
        <EditForm
          a={a}
          onCancel={() => setEditing(false)}
          onSave={async (next, publish) => {
            const e = await onSave(next, publish)
            if (!e) setEditing(false)
            return e
          }}
        />
      ) : (
        <>
          {warn.length > 0 && <p className="rounded bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-300">注意：{warn.join('、')}</p>}

          {a.desc && <p className="text-sm text-muted">{a.desc}</p>}

          {a.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {a.tags.map((t) => (TAGS[t] ? <TagBadge key={t} tag={t} /> : null))}
            </div>
          ) : (
            <p className="text-xs text-muted">未选择标签</p>
          )}

          <dl className="space-y-1.5 rounded-md bg-hover/60 p-3">
            <Row k="注册页">
              <a href={a.website} target="_blank" rel="noreferrer noopener nofollow" className="text-accent hover:underline">
                {a.website}
              </a>
            </Row>
            <Row k="套餐">
              <ul className="space-y-0.5">
                {a.plans.map((p, i) => (
                  <li key={i}>
                    <span className="font-medium">{planText(p)}</span>
                    <span className="ml-2 text-muted">
                      {[p.traffic, p.nodes && `${p.nodes}节点`, p.devices && `${p.devices}台设备`].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </Row>
            {contacts.length > 0 && (
              <Row k="联系">
                <div className="flex flex-wrap gap-2">
                  {contacts.map(([label, url]) => (
                    <a key={label} href={url} target="_blank" rel="noreferrer noopener nofollow" className="inline-flex items-center gap-1 text-accent hover:underline">
                      <TelegramIcon size={14} />
                      {label}
                    </a>
                  ))}
                </div>
              </Row>
            )}
            {a.freeCode && (
              <Row k="白嫖码">
                <span className="inline-flex items-center gap-2">
                  <code className="rounded bg-bg px-1.5 py-0.5 text-xs">{a.freeCode}</code>
                  <CopyButton text={a.freeCode} />
                </span>
              </Row>
            )}
            {a.foundedAt && <Row k="创建">{a.foundedAt}</Row>}
            {a.notes?.map((n, i) => (
              <Row key={i} k={i === 0 ? '备注' : ''}>
                {n}
              </Row>
            ))}
          </dl>

          <footer className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
            <code className="truncate text-xs text-muted" title="标识">
              {a.id}
            </code>
            <div className="flex shrink-0 gap-2">
              <DangerButton label="删除" confirmLabel="确认删除？" onConfirm={onDelete} />
              <button type="button" onClick={() => setEditing(true)} className="rounded border border-line px-3 py-1.5 text-sm hover:bg-hover">
                编辑
              </button>
              <button type="button" disabled={busy} onClick={onApprove} className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
                通过
              </button>
            </div>
          </footer>
        </>
      )}
    </article>
  )
}

export function PendingCommentCard({
  c,
  busy,
  onApprove,
  onReject,
}: {
  c: PendingComment
  busy: boolean
  onApprove: () => void
  onReject: () => void
}) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border border-line bg-card p-4">
      <header className="flex items-center justify-between gap-3 text-xs text-muted">
        <span className="min-w-0 truncate">
          评论于 <span className="font-medium text-fg">{c.airport_name || c.airport_id}</span>
        </span>
        <span className="shrink-0">{fmtTime(c.created_at)}</span>
      </header>
      <div className="flex items-center gap-2 text-sm">
        <span className="font-medium">{c.nickname}</span>
        {c.rating > 0 && <span className="text-yellow-600">{'★'.repeat(c.rating)}</span>}
      </div>
      <p className="whitespace-pre-wrap break-words text-sm">{c.content}</p>
      <footer className="mt-auto flex justify-end gap-2 border-t border-line pt-3">
        <DangerButton label="拒绝" confirmLabel="确认拒绝？" onConfirm={onReject} />
        <button type="button" disabled={busy} onClick={onApprove} className="rounded bg-accent px-4 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60">
          通过
        </button>
      </footer>
    </article>
  )
}
