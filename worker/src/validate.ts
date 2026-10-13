// 公益 / 免费 / 白嫖 / 性价比 / 直连 / 中转 / 专线
export const TAGS = ['charity', 'free', 'freebie', 'value', 'direct', 'relay', 'dedicated']
const PERIODS = ['month', 'quarter', 'year', 'once']
const STATUSES = ['ok', 'unstable', 'down']

type Result = { ok: true; value: Record<string, unknown> } | { ok: false; error: string }

const isUrl = (s: unknown, tg = false): s is string => {
  if (typeof s !== 'string' || s.length > 300) return false
  try {
    const u = new URL(s)
    return u.protocol === 'https:' || u.protocol === 'http:' || (tg && u.protocol === 'tg:')
  } catch {
    return false
  }
}
const strList = (v: unknown, max = 10) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.length <= 30).slice(0, max) : []

/**
 * 规范化并校验机场数据。trusted=true（管理员）可写 aff / speedtestImage / logo；
 * 公开提交只保留白名单字段。
 */
export function normalize(raw: any, trusted: boolean): Result {
  if (!raw || typeof raw !== 'object') return { ok: false, error: '数据格式错误' }
  const { id, name, desc, website } = raw
  if (typeof id !== 'string' || !/^[a-z0-9-]{2,40}$/.test(id)) return { ok: false, error: `id 非法: ${id}` }
  if (typeof name !== 'string' || !name.trim() || name.length > 40) return { ok: false, error: `${id}: name 非法` }
  if (typeof desc !== 'string' || desc.length > 200) return { ok: false, error: `${id}: desc 非法` }
  if (!isUrl(website)) return { ok: false, error: `${id}: website 非法` }

  // 标签可以为空：没有符合的标签就不加
  const tags = [...new Set(strList(raw.tags, TAGS.length).filter((t) => TAGS.includes(t)))]

  // 节点数跟随套餐：数字，可带 +（如 20、40+）
  const nodesOf = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, 10) : '')
  const plans = (Array.isArray(raw.plans) ? raw.plans : []).slice(0, 10).map((p: any) => {
    const n = nodesOf(p?.nodes)
    return {
      name: String(p?.name ?? '').slice(0, 30),
      price: Math.max(0, Number(p?.price) || 0),
      period: PERIODS.includes(p?.period) ? p.period : 'month',
      traffic: String(p?.traffic ?? '').trim().slice(0, 30) || '-',
      ...(n ? { nodes: n } : {}),
      ...(p?.devices ? { devices: Math.min(99, Number(p.devices) || 0) } : {}),
    }
  })
  if (!plans.length || plans.some((p: any) => !p.name)) return { ok: false, error: `${id}: plans 非法` }
  const badNodes = plans.find((p: any) => p.nodes && !/^\d{1,4}\+?$/.test(p.nodes))
  if (badNodes) return { ok: false, error: `${id}: 节点数需为数字，可带 +（如 20 或 40+）` }

  const c = raw.contacts ?? {}
  const contacts: Record<string, string> = {}
  for (const k of ['channel', 'group', 'support']) if (c[k]) {
    if (!isUrl(c[k], true)) return { ok: false, error: `${id}: contacts.${k} 非法` }
    contacts[k] = c[k]
  }

  // 日期：YYYY-MM 或 YYYY-MM-DD
  const dateStr = (v: unknown) => (typeof v === 'string' && /^\d{4}-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?$/.test(v.trim()) ? v.trim() : undefined)
  if (raw.foundedAt && !dateStr(raw.foundedAt)) return { ok: false, error: `${id}: 机场创建时间格式应为 YYYY-MM 或 YYYY-MM-DD` }
  if (trusted && raw.discoveredAt && !dateStr(raw.discoveredAt)) return { ok: false, error: `${id}: 发现时间格式非法` }

  const short = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined)
  const notes = (Array.isArray(raw.notes) ? raw.notes : [])
    .map((n: unknown) => short(n, 60))
    .filter(Boolean)
    .slice(0, 5)

  const value: Record<string, unknown> = {
    id,
    name: name.trim(),
    desc,
    tags,
    website,
    freeCode: short(raw.freeCode, 30),
    ...(notes.length ? { notes } : {}),
    plans,
    protocols: strList(raw.protocols),
    unlock: strList(raw.unlock),
    contacts,
    status: trusted && STATUSES.includes(raw.status) ? raw.status : 'ok',
    foundedAt: dateStr(raw.foundedAt),
    source: trusted ? (['manual', 'crawl'].includes(raw.source) ? raw.source : 'manual') : 'submit',
  }
  // 图片只接受 https 链接；公开投稿的图片会先进入待审核，由管理员确认后才展示
  const isHttps = (s: unknown): s is string => isUrl(s) && (s as string).startsWith('https://')
  if (raw.speedtestImage) {
    if (!isHttps(raw.speedtestImage)) return { ok: false, error: `${id}: 测速图需为 https 链接` }
    value.speedtestImage = raw.speedtestImage
    if (typeof raw.speedtestAt === 'string' && raw.speedtestAt) value.speedtestAt = raw.speedtestAt.slice(0, 10)
  }
  if (raw.topologyImage) {
    if (!isHttps(raw.topologyImage)) return { ok: false, error: `${id}: 拓扑图需为 https 链接` }
    value.topologyImage = raw.topologyImage
  }
  if (trusted) {
    if (raw.aff && isUrl(raw.aff)) value.aff = raw.aff
    if (raw.logo && isUrl(raw.logo)) value.logo = raw.logo
    if (raw.sourceUrl && isUrl(raw.sourceUrl)) value.sourceUrl = raw.sourceUrl
    const d = dateStr(raw.discoveredAt)
    if (d) value.discoveredAt = d
  }
  return { ok: true, value }
}
