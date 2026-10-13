// 把 web/public/data/airports.json 转成 D1 种子 SQL：worker/seed.sql
import { readFileSync, writeFileSync } from 'node:fs'

const list = JSON.parse(readFileSync(new URL('../web/public/data/airports.json', import.meta.url), 'utf8'))
const now = new Date().toISOString()
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

const sql = list
  .map((a) => {
    // hot / rating 等聚合字段由后端计算，不入库
    const { hot, rating, ratingCount, updatedAt, ...data } = a
    return `INSERT OR REPLACE INTO airports(id,data,status,source,created_at,updated_at) VALUES(${q(a.id)},${q(JSON.stringify(data))},'published',${q(a.source ?? 'manual')},${q(now)},${q(updatedAt ? updatedAt + 'T00:00:00.000Z' : now)});`
  })
  .join('\n')

writeFileSync(new URL('../worker/seed.sql', import.meta.url), sql + '\n')
console.log(`wrote worker/seed.sql (${list.length} airports)`)
