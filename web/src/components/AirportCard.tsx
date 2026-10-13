import { Link } from 'react-router-dom'
import { fmtHot, planText } from '../lib'
import type { Airport } from '../types'
import { Avatar, ContactLinks, SpeedImage, StatusDot, TagBadge, WebsiteButton } from './ui'

export function AirportCard({ a }: { a: Airport }) {
  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-card p-4 transition-shadow hover:shadow-sm">
      <Link to={`/airport/${a.id}`} className="flex items-center gap-3">
        <Avatar a={a} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{a.name}</h3>
          <StatusDot status={a.status} />
        </div>
        {a.hot != null && <span className="text-xs text-muted">热度 {fmtHot(a.hot)}</span>}
      </Link>

      <Link to={`/airport/${a.id}`}>
        <SpeedImage a={a} className="h-24" />
      </Link>

      {a.desc && <p className="line-clamp-2 text-sm text-muted">{a.desc}</p>}

      {a.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {a.tags.map((t) => (
            <TagBadge key={t} tag={t} />
          ))}
        </div>
      )}

      <ul className="space-y-0.5 text-xs text-muted">
        {a.plans.slice(0, 2).map((p, i) => (
          <li key={i} className="flex justify-between gap-2">
            <span className="truncate">{[p.traffic, p.nodes && `${p.nodes}节点`].filter(Boolean).join(' · ')}</span>
            <span className="shrink-0 font-medium text-fg">{planText(p)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-3">
        <ContactLinks a={a} />
        <WebsiteButton a={a} />
      </div>
    </article>
  )
}

export function AirportGrid({ list }: { list: Airport[] }) {
  if (!list.length) return <p className="py-10 text-center text-sm text-muted">暂无内容</p>
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {list.map((a) => (
        <AirportCard key={a.id} a={a} />
      ))}
    </div>
  )
}
