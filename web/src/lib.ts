import type { Airport, Period, Plan, Status, Tag } from './types'

// desc 为空表示该标签没有说明，界面上就不显示
export const TAGS: Record<Tag, { label: string; desc?: string; cls: string }> = {
  charity: { label: '公益机场', desc: '长期提供免费套餐的机场', cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  free: { label: '免费机场', desc: '一般是新开的，免费一个月', cls: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300' },
  freebie: { label: '白嫖机场', desc: '有免费试用，一般很少', cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300' },
  value: { label: '性价比机场', desc: '不超过 5 元 100G', cls: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300' },
  direct: { label: '直连机场', cls: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300' },
  relay: { label: '中转机场', cls: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300' },
  dedicated: { label: '专线机场', cls: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300' },
}
export const TAG_KEYS = Object.keys(TAGS) as Tag[]

/**
 * 兼容旧数据（线上库里早期入库的记录）：
 *  - 丢弃已不存在的标签（如 premium）
 *  - 旧的 kind（线路类型）转成对应标签
 *  - 机场级 nodes 下放到没有节点数的套餐上
 */
const LEGACY_KIND_TAG: Record<string, Tag> = {
  公益机场: 'charity',
  免费机场: 'free',
  低价机场: 'value',
  直连机场: 'direct',
  中转机场: 'relay',
  专线机场: 'dedicated',
}
export function normalizeAirport(raw: any): Airport {
  const { kind, nodes, ...rest } = raw
  const tags = new Set<Tag>(((raw.tags ?? []) as string[]).filter((t): t is Tag => t in TAGS))
  if (kind && LEGACY_KIND_TAG[kind]) tags.add(LEGACY_KIND_TAG[kind])
  const plans = ((raw.plans ?? []) as Plan[]).map((p) => (p.nodes || !nodes ? p : { ...p, nodes: String(nodes) }))
  return { ...rest, tags: TAG_KEYS.filter((t) => tags.has(t)), plans }
}

export const STATUS: Record<Status, { label: string; dot: string }> = {
  ok: { label: '运营正常', dot: 'bg-green-500' },
  unstable: { label: '不太稳定', dot: 'bg-yellow-500' },
  down: { label: '疑似跑路', dot: 'bg-red-500' },
}

export const PERIOD_LABEL: Record<Period, string> = { month: '月', quarter: '季', year: '年', once: '一次性' }
const PERIOD_MONTHS: Record<Period, number> = { month: 1, quarter: 3, year: 12, once: 0 }

export function monthlyPrice(p: Plan) {
  if (p.price === 0) return 0
  const m = PERIOD_MONTHS[p.period]
  return m ? p.price / m : p.price
}
export function minMonthly(a: Airport) {
  return a.plans.length ? Math.min(...a.plans.map(monthlyPrice)) : Infinity
}
export function planText(p: Plan) {
  return p.price === 0 ? '免费' : `¥${p.price}/${PERIOD_LABEL[p.period]}`
}
export function fmtHot(n = 0) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)
}
export function outUrl(a: Airport) {
  return a.aff || a.website
}

export function related(all: Airport[], a: Airport, n = 4) {
  const price = minMonthly(a)
  return all
    .filter((b) => b.id !== a.id && b.status !== 'down')
    .map((b) => {
      let s = b.tags.filter((t) => a.tags.includes(t)).length * 2
      s += (b.protocols ?? []).filter((p) => a.protocols?.includes(p)).length
      const bp = minMonthly(b)
      if (isFinite(price) && isFinite(bp) && Math.abs(bp - price) <= 10) s += 1
      return { b, s }
    })
    .sort((x, y) => y.s - x.s || (y.b.hot ?? 0) - (x.b.hot ?? 0))
    .slice(0, n)
    .map((x) => x.b)
}

export type SortKey = 'hot' | 'price' | 'rating' | 'new'
export function sortAirports(list: Airport[], key: SortKey) {
  const arr = [...list]
  switch (key) {
    case 'price': return arr.sort((a, b) => minMonthly(a) - minMonthly(b))
    case 'rating': return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    case 'new': {
      const t = (x: Airport) => x.discoveredAt ?? x.updatedAt ?? ''
      return arr.sort((a, b) => t(b).localeCompare(t(a)))
    }
    default: return arr.sort((a, b) => (b.hot ?? 0) - (a.hot ?? 0))
  }
}
