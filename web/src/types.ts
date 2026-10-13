export type Tag = 'charity' | 'free' | 'freebie' | 'value' | 'direct' | 'relay' | 'dedicated'
export type Period = 'month' | 'quarter' | 'year' | 'once'
export type Status = 'ok' | 'unstable' | 'down'
export type HitKind = 'view' | 'website' | 'channel' | 'group' | 'support'

export interface Plan {
  name: string
  price: number // 0 = 免费
  period: Period
  traffic: string
  nodes?: string // 该套餐的节点数，如 "20" / "40+"
  devices?: number
  note?: string
}

export interface Airport {
  id: string // slug，同时作为 URL
  name: string
  desc: string
  tags: Tag[]
  website: string
  aff?: string // 推广链接，仅管理员可写
  logo?: string
  speedtestImage?: string
  speedtestAt?: string
  topologyImage?: string
  freeCode?: string // 白嫖码
  notes?: string[] // 其他说明
  sourceUrl?: string
  discoveredAt?: string // 发现时间：本站发现 / 收录该机场的日期
  plans: Plan[]
  protocols?: string[]
  unlock?: string[]
  contacts: { channel?: string; group?: string; support?: string }
  status: Status
  foundedAt?: string // 机场创建时间：YYYY-MM 或 YYYY-MM-DD
  source?: 'manual' | 'crawl' | 'submit'
  // 以下由后端聚合返回
  hot?: number
  rating?: number
  ratingCount?: number
  updatedAt?: string
}

export interface Comment {
  id: number
  nickname: string
  content: string
  rating: number
  created_at: string
}
