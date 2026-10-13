import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AirportGrid } from '../components/AirportCard'
import { useAirports } from '../data'
import { sortAirports, TAGS, TAG_KEYS, type SortKey } from '../lib'
import type { Tag } from '../types'

const SORTS: [SortKey, string][] = [['hot', '热度'], ['price', '价格'], ['rating', '评分'], ['new', '最新']]

export default function Category() {
  const { tag } = useParams()
  const { airports, loading } = useAirports()
  const [sort, setSort] = useState<SortKey>('hot')

  const current = tag && tag in TAGS ? (tag as Tag) : undefined
  const list = sortAirports(airports.filter((a) => !current || a.tags.includes(current)), sort)

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-1.5">
        {[undefined, ...TAG_KEYS].map((t) => (
          <Link
            key={t ?? 'all'}
            to={t ? `/category/${t}` : '/category'}
            className={`rounded px-2.5 py-1 text-sm ${current === t ? 'bg-hover font-medium' : 'text-muted hover:bg-hover'}`}
          >
            {t ? TAGS[t].label : '全部'}
          </Link>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {current ? [TAGS[current].label, TAGS[current].desc].filter(Boolean).join('：') : '全部机场'} · {list.length} 个
        </p>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="rounded border border-line bg-bg px-2 py-1 text-sm"
        >
          {SORTS.map(([k, l]) => (
            <option key={k} value={k}>按{l}排序</option>
          ))}
        </select>
      </div>

      {loading ? <p className="py-10 text-center text-sm text-muted">加载中…</p> : <AirportGrid list={list} />}
    </div>
  )
}
