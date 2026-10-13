import { Link, useSearchParams } from 'react-router-dom'
import { AirportGrid } from '../components/AirportCard'
import { useAirports } from '../data'
import { sortAirports, TAGS } from '../lib'

export default function Search() {
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim().toLowerCase()
  const { airports, loading } = useAirports()

  const hit = q
    ? airports.filter((a) =>
        [a.name, a.desc, ...a.tags.map((t) => TAGS[t].label), ...(a.protocols ?? []), ...(a.unlock ?? [])]
          .join(' ')
          .toLowerCase()
          .includes(q),
      )
    : []
  const hot = sortAirports(airports, 'hot').slice(0, 3)

  if (loading) return <p className="py-10 text-center text-sm text-muted">加载中…</p>

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{q ? `搜索“${params.get('q')}”· ${hit.length} 个结果` : '请输入关键词'}</h1>
      {hit.length > 0 && <AirportGrid list={sortAirports(hit, 'hot')} />}
      {q && hit.length === 0 && (
        <div className="space-y-3">
          <p className="text-sm text-muted">没有找到相关机场，试试这些热门：</p>
          <AirportGrid list={hot} />
          <p className="text-sm text-muted">
            没收录？<Link to="/submit" className="text-accent">提交收录</Link>
          </p>
        </div>
      )}
    </div>
  )
}
