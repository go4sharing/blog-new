import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchComments, HAS_API, postJson, track } from '../api'
import { AirportGrid } from '../components/AirportCard'
import Reactions from '../components/Reactions'
import { Avatar, ContactLinks, CopyButton, ImageBlock, SpeedImage, StatusDot, TagBadge, Turnstile, WebsiteButton } from '../components/ui'
import { useAirports } from '../data'
import { fmtHot, PERIOD_LABEL, related } from '../lib'
import type { Airport, Comment } from '../types'

// 灯箱按需加载，不增加首屏体积
const ImageLightbox = lazy(() => import('../components/ImageLightbox'))

export default function Detail() {
  const { id = '' } = useParams()
  const { airports, loading } = useAirports()
  const a = airports.find((x) => x.id === id)
  const [preview, setPreview] = useState<number | null>(null)

  useEffect(() => setPreview(null), [id])

  useEffect(() => {
    if (a) {
      track(a.id, 'view')
      document.title = `${a.name} - 机场导航`
    }
  }, [a?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <p className="py-10 text-center text-sm text-muted">加载中…</p>
  if (!a) return <p className="py-10 text-center text-sm text-muted">未找到该机场，<Link to="/" className="text-accent">返回首页</Link></p>

  // 测速图与拓扑图放进同一个灯箱，可左右切换
  const slides = [
    a.speedtestImage && { key: 'speed', src: a.speedtestImage, title: `${a.name} · 测速图${a.speedtestAt ? `（${a.speedtestAt}）` : ''}` },
    a.topologyImage && { key: 'topo', src: a.topologyImage, title: `${a.name} · 拓扑图` },
  ].filter(Boolean) as { key: string; src: string; title: string }[]
  const open = (key: string) => setPreview(Math.max(0, slides.findIndex((s) => s.key === key)))

  return (
    <div className="space-y-8">
      {preview !== null && (
        <Suspense fallback={null}>
          <ImageLightbox slides={slides} index={preview} onClose={() => setPreview(null)} />
        </Suspense>
      )}

      <header className="flex flex-wrap items-center gap-4">
        <Avatar a={a} size={48} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">{a.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusDot status={a.status} />
            {a.tags.map((t) => <TagBadge key={t} tag={t} />)}
            {a.rating != null && <span className="text-xs text-muted">★ {a.rating.toFixed(1)}（{a.ratingCount ?? 0}）</span>}
            <span className="text-xs text-muted">热度 {fmtHot(a.hot)}</span>
          </div>
        </div>
        <WebsiteButton a={a} className="px-5 py-1.5 text-sm" />
      </header>

      <p className="text-sm leading-relaxed">{a.desc}</p>

      {HAS_API && <Reactions id={a.id} />}

      <BasicInfo a={a} />

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">测速</h2>
        {a.speedtestImage ? <ImageBlock src={a.speedtestImage} alt={`${a.name} 测速图`} onOpen={() => open('speed')} /> : <SpeedImage a={a} className="h-24" />}
        <p className="text-xs text-muted">
          {a.speedtestAt ? `测速时间：${a.speedtestAt}，` : ''}测速结果仅供参考，实际体验因地区、运营商与时段而异。
        </p>
      </section>

      {a.topologyImage && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">拓扑图</h2>
          <ImageBlock src={a.topologyImage} alt={`${a.name} 拓扑图`} onOpen={() => open('topo')} />
          <p className="text-xs text-muted">展示入口与出口节点的线路关系，可用来判断是否为中转、落地所在地区。</p>
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">套餐</h2>
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-left text-sm">
            <thead className="bg-hover text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">名称</th>
                <th className="px-3 py-2 font-medium">价格</th>
                <th className="px-3 py-2 font-medium">流量</th>
                <th className="px-3 py-2 font-medium">节点数</th>
                {a.plans.some((p) => p.devices) && <th className="px-3 py-2 font-medium">设备</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {a.plans.map((p, i) => (
                <tr key={i}>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2">{p.price === 0 ? '免费' : `¥${p.price} / ${PERIOD_LABEL[p.period]}`}</td>
                  <td className="px-3 py-2">{p.traffic}</td>
                  <td className="px-3 py-2">{p.nodes ?? '-'}</td>
                  {a.plans.some((x) => x.devices) && <td className="px-3 py-2">{p.devices ?? '-'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <Info title="协议" items={a.protocols} />
        <Info title="解锁" items={a.unlock} />
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">联系方式</h2>
        <ContactLinks a={a} detail />
        {!Object.keys(a.contacts).length && <p className="text-sm text-muted">暂无联系方式</p>}
      </section>

      {HAS_API && <Comments id={a.id} />}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">相关推荐</h2>
        <AirportGrid list={related(airports, a)} />
      </section>
    </div>
  )
}

function BasicInfo({ a }: { a: Airport }) {
  const rows: [string, ReactNode][] = []
  if (a.freeCode)
    rows.push([
      '白嫖码',
      <span className="inline-flex items-center gap-2">
        <code className="rounded bg-hover px-1.5 py-0.5 text-xs">{a.freeCode}</code>
        <CopyButton text={a.freeCode} />
      </span>,
    ])
  if (a.foundedAt) rows.push(['创建时间', a.foundedAt])
  if (a.discoveredAt) rows.push(['发现时间', a.discoveredAt])
  if (a.sourceUrl)
    rows.push([
      '来源',
      <a href={a.sourceUrl} target="_blank" rel="nofollow noopener noreferrer" className="text-accent hover:underline">
        原文链接
      </a>,
    ])
  if (!rows.length && !a.notes?.length) return null

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">基本信息</h2>
      <dl className="divide-y divide-line rounded-lg border border-line text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center gap-4 px-3 py-2">
            <dt className="w-16 shrink-0 text-muted">{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        {a.notes?.map((n, i) => (
          <div key={i} className="flex items-center gap-4 px-3 py-2">
            <dt className="w-16 shrink-0 text-muted">{i === 0 ? '备注' : ''}</dt>
            <dd>{n}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

function Info({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null
  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="flex flex-wrap gap-1.5">
        {items.map((i) => <span key={i} className="rounded bg-hover px-2 py-0.5 text-xs">{i}</span>)}
      </div>
    </div>
  )
}

function Comments({ id }: { id: string }) {
  const [list, setList] = useState<Comment[]>([])
  const [nickname, setNickname] = useState('')
  const [content, setContent] = useState('')
  const [rating, setRating] = useState(5)
  const [token, setToken] = useState('')
  const [msg, setMsg] = useState('')

  useEffect(() => { fetchComments(id).then(setList) }, [id])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!token) return setMsg('请先完成人机验证')
    const r = await postJson(`/api/airports/${id}/comments`, { nickname, content, rating, token })
    setMsg(r.ok ? '提交成功，审核通过后显示' : r.data.error || '提交失败')
    if (r.ok) { setContent(''); setToken(''); window.turnstile?.reset() }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">用户评价</h2>
      {list.length === 0 && <p className="text-sm text-muted">暂无评价</p>}
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex justify-between text-xs text-muted">
              <span>{c.nickname}{c.rating ? ` · ★${c.rating}` : ''}</span>
              <span>{c.created_at.slice(0, 10)}</span>
            </div>
            <p className="mt-1 whitespace-pre-wrap">{c.content}</p>
          </li>
        ))}
      </ul>

      <form onSubmit={submit} className="space-y-2 rounded-lg border border-line p-3">
        <div className="flex gap-2">
          <input value={nickname} onChange={(e) => setNickname(e.target.value)} maxLength={20} required placeholder="昵称"
            className="w-32 rounded border border-line bg-transparent px-2 py-1 text-sm" />
          <select value={rating} onChange={(e) => setRating(+e.target.value)} className="rounded border border-line bg-bg px-2 py-1 text-sm">
            {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>★ {n}</option>)}
          </select>
        </div>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={500} required rows={3} placeholder="分享你的使用体验（500 字以内）"
          className="w-full rounded border border-line bg-transparent px-2 py-1 text-sm" />
        <Turnstile onToken={setToken} />
        <div className="flex items-center gap-3">
          <button className="rounded bg-accent px-3 py-1 text-sm text-white">发表评价</button>
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      </form>
    </section>
  )
}
