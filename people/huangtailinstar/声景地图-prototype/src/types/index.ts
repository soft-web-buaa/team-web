// 声景地图核心类型定义

export type Visibility = '匿名公开' | '好友可见' | '仅自己'
export type MemoryType = '此刻' | '清晨' | '午后' | '黄昏' | '深夜' | '雨后' | '考试周'
export type Scene =
  | 'birds' | 'wind' | 'rain' | 'canteen' | 'footsteps' | 'library'
  | 'gym' | 'night' | 'fountain' | 'leaves' | 'chatter' | 'music'

export interface Location {
  id: string
  name: string
  x: number // 百分比
  y: number
  category: '教学' | '生活' | '运动' | '风景' | '出入口'
}

export interface Author {
  id: string
  name: string
  color: string
}

export interface Echo {
  id: string
  authorName: string
  authorColor: string
  text: string
  scene: Scene
  cover: [string, string]
  createdAt: number
}

export interface SoundRecord {
  id: string
  title: string            // 一句内心感受
  locationId: string
  locationName: string
  authorId: string
  authorName: string
  authorColor: string
  cover: [string, string]  // 封面渐变（景色抽象）
  photo?: string           // dataURL 用户上传照片
  scene: Scene
  audioUrl?: string        // 用户真实录音 blob url（可选）
  duration: number         // 秒
  createdAt: number
  memoryType: MemoryType
  visibility: Visibility
  inCommunity: boolean
  isMine: boolean
  favorite: boolean
  likedBy: string[]        // 被打动的用户 id
  echoes: Echo[]           // 追加的小唱片
  collectionId?: string
  isCapsule: boolean
  unlockAt?: number
  mood: number             // 情绪值 0-100，用于热力图（越高越明亮）
  activity: number         // 声音活跃度 0-100
  quiet: number            // 安静程度 0-100
}

export interface Collection {
  id: string
  name: string
  theme: string
  kind: '官方' | '共建'
  description: string
  color: string
  memberCount: number
}

export interface InboxMessage {
  id: string
  from: string
  text: string
  recordId: string
  createdAt: number
  read: boolean
  type: '打动' | '回声' | '合辑邀请'
}

export interface AppData {
  records: SoundRecord[]
  inbox: InboxMessage[]
  collections: Collection[]
}
