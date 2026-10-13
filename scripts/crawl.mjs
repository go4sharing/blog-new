// 爬取 https://go4sharing.github.io 的机场条目，输出 web/public/data/airports.json
// 用法：node scripts/crawl.mjs [--limit 20] [--all] [--keep-ref]
//   --limit N     取最新 N 条（默认 20）
//   --all         取全部条目
//   --keep-ref    保留源站注册链接里的邀请码，并写入 aff；默认剔除邀请参数，aff 留空
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'

const BASE = 'https://go4sharing.github.io'
const args = process.argv.slice(2)
const all = args.includes('--all')
const limit = all ? Infinity : Number(args[args.indexOf('--limit') + 1]) || 20
const keepRef = args.includes('--keep-ref')

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
const text = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
const abs = (p) => (p.startsWith('http') ? p : BASE + p)

const REF_PARAMS = /^(code|invite_?code|invite|aff|ref|inviter|affid|r|i)$/i
function stripRef(url) {
  try {
    const u = new URL(url)
    for (const k of [...u.searchParams.keys()]) if (REF_PARAMS.test(k)) u.searchParams.delete(k)
    // 形如 https://x/#/register?code=abc 的 hash 路由
    const [hp, hq = ''] = u.hash.split('?')
    if (hq) {
      const sp = new URLSearchParams(hq)
      for (const k of [...sp.keys()]) if (REF_PARAMS.test(k)) sp.delete(k)
      u.hash = sp.toString() ? `${hp}?${sp}` : hp
    }
    return u.toString()
  } catch {
    return url
  }
}

// ---------- 套餐解析 ----------

const UNLIMITED = /[♾∞]\uFE0F?\s*G?/g
// 标题里“名称”与“套餐”的分界：套餐以 价格元 或 数字+流量单位 或 无限符号 开头
const PLAN_START = /^(?:[\d.]+\s*元|[\d.]+\s*(?:PB|[GT]B?(?=[\/\s,，每月天年不]|$))|[♾∞])/i
// 正文中的“额外套餐行”：价格后紧跟周期或流量，排除“5元套餐体验码”这类说明
const EXTRA_PLAN = /^[\d.]+\s*元\s*(?:\/\s*[年季月]|[\d.]+\s*[GTP])/i

function splitTitle(rest) {
  const tokens = rest.split(/\s+/)
  for (let i = 1; i < tokens.length; i++) {
    const tail = tokens.slice(i).join(' ')
    if (PLAN_START.test(tail)) return { name: tokens.slice(0, i).join(' '), planLine: tail }
  }
  return null
}

function parseOne(seg) {
  const m = seg.trim().match(/^([\d.]+)\s*元\s*(.*)$/)
  if (!m) return { name: '', price: 0, period: 'month', traffic: seg.trim() || '-' }
  let rest = m[2]
  let period = 'month'
  const p = rest.match(/^\/\s*(年|季度?|月)\s*[,，]?\s*/)
  if (p) {
    period = p[1] === '年' ? 'year' : p[1].startsWith('季') ? 'quarter' : 'month'
    rest = rest.slice(p[0].length)
  }
  return { name: '', price: Number(m[1]), period, traffic: rest.trim() || '-' }
}

/** 解析一行套餐，返回 { nodes, plans }；一行可能含多个“N元”套餐，节点数写在行尾，归属这一行的所有套餐 */
function parsePlanLine(line) {
  const line2 = line.replace(UNLIMITED, '不限')
  const nm = line2.match(/[,，\s]*(\d+\+?)\s*个?\s*(?:[A-Za-z]+\s*)?节点/)
  const nodes = nm?.[1]
  const body = (nm ? line2.replace(nm[0], '') : line2).replace(/[,，\s]+$/, '').trim()
  const segs = body.split(/[,，]\s*(?=[\d.]+\s*元)/)
  const plans = segs.map(parseOne)
  // “15.5元100G/月, 152.5元/年”：后一段没写流量，沿用前一段
  plans.forEach((p, i) => {
    if (p.traffic === '-' && i > 0) p.traffic = plans[i - 1].traffic
    if (nodes) p.nodes = nodes
  })
  return { nodes, plans }
}

const MONTHS = { month: 1, quarter: 3, year: 12 }
const monthly = (p) => (p.price === 0 ? 0 : p.price / (MONTHS[p.period] ?? 1))

/** 流量文字 → 每月 GB；按天 / 按小时 / 不限量等无法折算的返回 0 */
function monthlyGB(traffic) {
  if (/天|小时/.test(traffic)) return 0
  const m = traffic.match(/([\d.]+)\s*(PB|TB|GB|MB|T|G|M)(?![A-Za-z])/i)
  if (!m) return 0
  const unit = { PB: 1024 * 1024, TB: 1024, T: 1024, GB: 1, G: 1, MB: 1 / 1024, M: 1 / 1024 }[m[2].toUpperCase()]
  let gb = Number(m[1]) * unit
  if (/\/\s*年/.test(traffic)) gb /= 12
  else if (/\/\s*季/.test(traffic)) gb /= 3
  return gb
}

/** 性价比机场：不超过 5 元 100G（按每月价格 / 每月流量折算） */
const VALUE_PER_100G = 5
function isValuePlan(p) {
  const gb = monthlyGB(p.traffic)
  return p.price > 0 && gb > 0 && (monthly(p) / gb) * 100 <= VALUE_PER_100G
}

// 源站分类 → 方向标签。没有对应分类的（如“原生机场”）不加
const KIND_DIRECTION = { 中转机场: 'relay', 直连机场: 'direct', 专线机场: 'dedicated' }

// ---------- 条目解析 ----------

const TUTORIAL = /^(打开|点击|输入|到\s|选择|填写|复制)/

function parseEntry(raw) {
  const title = decode(raw.match(/<title>([^<]*)/)?.[1] ?? '').trim()
  const url = raw.match(/<url>([^<]*)/)?.[1] ?? ''
  const html = raw.match(/CDATA\[([\s\S]*?)\]\]>/)?.[1] ?? ''
  const cats = [...raw.matchAll(/<category>([^<]*)/g)].map((m) => decode(m[1]))
  const date = decodeURIComponent(url).match(/\/(\d{4})\/(\d{2})\/(\d{2})\//)?.slice(1).join('-')

  // 个别文章没有分类（如只有标题），此时用标题第一个词作为类型
  if (cats.length && cats[0] !== '机场') return { skip: '非机场分类' }
  const kind = cats[1] ?? cats[0] ?? title.split(/\s+/)[0]

  // 拓扑图标题之前的第一张图是测速图
  const head = html.split(/<h2[^>]*>\s*(?:<a[^>]*><\/a>)?\s*拓扑图/)[0]
  const img = head.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1]
  const topo = html.split(/<h2[^>]*>\s*(?:<a[^>]*><\/a>)?\s*拓扑图[^<]*<\/h2>/)[1]?.match(/<img[^>]*\ssrc="([^"]+)"/)?.[1]

  const contacts = {}
  let register
  const notes = []
  const extraPlanLines = []
  let bodyPlanLine
  for (const [, inner] of html.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const t = text(inner)
    if (!t) continue
    const href = inner.match(/<a [^>]*href="([^"]+)"/)?.[1]
    if (href) {
      const link = decode(href)
      if (/注册/.test(t)) register ??= link
      else if (/客服/.test(t)) contacts.support ??= link
      else if (/群/.test(t)) contacts.group ??= link
      else if (/频道/.test(t)) contacts.channel ??= link
    } else if (EXTRA_PLAN.test(t)) extraPlanLines.push(t)
    else if (!bodyPlanLine && /(节点|\d\s*[GT]B?|PB|[♾∞])/i.test(t)) bodyPlanLine = t
    else if (!TUTORIAL.test(t)) notes.push(t)
  }
  if (!register) return { skip: '无注册地址' }

  // 标题格式固定为「类型 名称 套餐」，以标题为准；标题拆不出来时才退回正文
  const rest = title.replace(/^\S+\s+/, '')
  let name
  let planLine
  const sp = splitTitle(rest)
  if (sp) ({ name, planLine } = sp)
  else if (bodyPlanLine) {
    planLine = bodyPlanLine
    const ns = bodyPlanLine.replace(/\s+/g, '')
    for (let i = 0; i < rest.length; i++) {
      if (rest.slice(i).replace(/\s+/g, '') === ns) { name = rest.slice(0, i); break }
    }
    name ??= rest
  }
  if (!planLine) return { skip: '无套餐信息' }
  name = name.replace(/[\s\-–—:：]+$/, '').trim()

  const first = parsePlanLine(planLine)
  const plans = [...first.plans, ...extraPlanLines.flatMap((l) => parsePlanLine(l).plans)]
  // 没有单独写节点数的套餐，沿用标题里的节点数
  if (first.nodes) plans.forEach((p) => (p.nodes ??= first.nodes))
  const seen = new Set()
  const uniq = plans.filter((p) => {
    const k = `${p.price}|${p.period}|${p.traffic}`
    return seen.has(k) ? false : (seen.add(k), true)
  }).slice(0, 5)
  const freeN = uniq.filter((p) => p.price === 0).length
  uniq.forEach((p, i) => {
    p.name = p.price === 0 ? (freeN > 1 ? `免费套餐${i + 1}` : '免费套餐') : uniq.length > 1 ? `套餐${i + 1}` : '基础套餐'
  })

  // 白嫖码单独成字段；其余说明作为备注
  let freeCode
  const extra = []
  for (const n of notes) {
    const m = n.match(/白嫖码[:：\s]*([A-Za-z0-9]{4,})\s*$/)
    if (m) freeCode = m[1]
    else extra.push(n.slice(0, 60))
  }

  // 标签规则（没有符合的就不加）：
  //   公益   源站分类为“公益机场”（长期提供免费套餐）
  //   免费   源站分类为“免费机场”（一般是新开的，免费一个月）
  //   白嫖   其他分类的机场里带免费套餐的（有免费试用，一般很少）
  //   性价比 任一付费套餐不超过 5 元 100G
  //   直连 / 中转 / 专线   按源站分类
  const tags = new Set()
  if (kind === '公益机场') tags.add('charity')
  if (kind === '免费机场') tags.add('free')
  if (uniq.some((p) => p.price === 0) && kind !== '公益机场' && kind !== '免费机场') tags.add('freebie')
  if (uniq.some(isValuePlan)) tags.add('value')
  if (KIND_DIRECTION[kind]) tags.add(KIND_DIRECTION[kind])
  const order = ['charity', 'free', 'freebie', 'value', 'direct', 'relay', 'dedicated']

  return {
    name,
    host: new URL(register).hostname,
    airport: {
      desc: '',
      tags: order.filter((t) => tags.has(t)),
      website: keepRef ? register : stripRef(register),
      ...(keepRef ? { aff: register } : {}),
      ...(img ? { speedtestImage: abs(img) } : {}),
      ...(topo ? { topologyImage: abs(topo) } : {}),
      plans: uniq,
      ...(freeCode ? { freeCode } : {}),
      ...(extra.length ? { notes: extra.slice(0, 5) } : {}),
      contacts,
      status: 'ok',
      source: 'crawl',
      sourceUrl: abs(url),
      discoveredAt: date, // 以源站文章发布日期作为发现时间，保证重复爬取结果稳定
      updatedAt: date,
    },
  }
}

const xml = await (await fetch(`${BASE}/local-search.xml`)).text()
const entries = xml.split('<entry>').slice(1, all ? undefined : limit + 1)

const parsed = entries.map(parseEntry)
const skipped = []
parsed.forEach((p, i) => {
  if (p.skip) skipped.push(`${p.skip}: ${decode(entries[i].match(/<title>([^<]*)/)?.[1] ?? '?')}`)
})

// 同名条目（如两个“樱花云”）用注册域名区分
const items = parsed.filter((p) => !p.skip)
const nameCount = {}
for (const p of items) nameCount[p.name] = (nameCount[p.name] ?? 0) + 1

const used = new Set()
const list = items.map((p) => {
  const display = nameCount[p.name] > 1 ? `${p.name}（${p.host}）` : p.name
  // 纯英文名用 slug；含中文等字符的名称用哈希，保证 id 稳定且符合 [a-z0-9-]
  const pure = /^[A-Za-z0-9 .\-_]+$/.test(display)
  const ascii = pure ? display.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') : ''
  let id = ascii.length >= 2 ? ascii.slice(0, 32) : 'g4s-' + createHash('sha1').update(p.name + p.host).digest('hex').slice(0, 8)
  if (used.has(id)) id += '-' + createHash('sha1').update(p.host + display).digest('hex').slice(0, 4)
  used.add(id)
  return { id, name: display.slice(0, 40), ...p.airport }
})

writeFileSync(new URL('../web/public/data/airports.json', import.meta.url), JSON.stringify(list, null, 2) + '\n')
console.log(`crawled ${entries.length}, wrote ${list.length}, skipped ${skipped.length}`)
skipped.forEach((s) => console.log('SKIP', s))
