import { Link } from 'react-router-dom'
import { HAS_API } from '../api'
import { AirportGrid } from '../components/AirportCard'
import { RankList } from '../components/RankList'
import { useAirports } from '../data'
import { sortAirports, TAGS, TAG_KEYS } from '../lib'

export default function Home() {
  const { airports, loading } = useAirports()
  if (loading) return <p className="py-10 text-center text-sm text-muted">加载中…</p>

  const visible = airports.filter((a) => a.status !== 'down')
  const top = sortAirports(visible, 'hot').slice(0, 5)
  const latest = sortAirports(visible, 'new').slice(0, 6)

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-3xl font-bold">机场导航</h1>
        <p className="mt-2 text-sm text-muted">收录公益、免费、白嫖、性价比、直连、中转、专线机场，附测速、套餐与联系方式。</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {HAS_API && (
            <Link to="/submit" className="rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:opacity-90">
              + 投稿收录
            </Link>
          )}
          {TAG_KEYS.map((t) => (
            <Link key={t} to={`/category/${t}`} className={`rounded px-2 py-1 text-sm ${TAGS[t].cls}`}>
              {TAGS[t].label}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">热度排行</h2>
        <RankList list={top} />
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">最新收录</h2>
          <Link to="/category" className="text-sm text-muted hover:text-fg">查看全部 →</Link>
        </div>
        <AirportGrid list={latest} />
      </section>

      {HAS_API && (
        <section className="rounded-lg border border-dashed border-line p-5 text-center">
          <p className="text-sm font-medium">没找到你想要的机场？</p>
          <p className="mt-1 text-xs text-muted">欢迎投稿收录，审核通过后展示。</p>
          <Link to="/submit" className="mt-3 inline-block rounded border border-line px-4 py-1.5 text-sm hover:bg-hover">
            去投稿
          </Link>
        </section>
      )}
    </div>
  )
}
