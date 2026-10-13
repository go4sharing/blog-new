import { Link } from 'react-router-dom'
import { fmtHot } from '../lib'
import type { Airport } from '../types'
import { Avatar, TagBadge } from './ui'

export function RankList({ list }: { list: Airport[] }) {
  return (
    <ol className="divide-y divide-line rounded-lg border border-line bg-card">
      {list.map((a, i) => (
        <li key={a.id}>
          <Link to={`/airport/${a.id}`} className="flex items-center gap-3 px-3 py-2.5 hover:bg-hover">
            <span className={`w-5 text-center text-sm font-semibold ${i < 3 ? 'text-accent' : 'text-muted'}`}>{i + 1}</span>
            <Avatar a={a} size={24} />
            <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
            <span className="hidden sm:block">{a.tags[0] && <TagBadge tag={a.tags[0]} />}</span>
            <span className="text-xs text-muted">{fmtHot(a.hot)}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
