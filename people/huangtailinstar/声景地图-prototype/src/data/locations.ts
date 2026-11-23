import type { Location } from '@/types'

// 坐标基于裁剪后的纯地图图（1038 × 1076）的百分比位置
export const LOCATIONS: Location[] = [
  { id: 'lib',    name: '图书馆',     x: 43, y: 31, category: '教学' },
  { id: 'lake',   name: '绿园湖畔',   x: 44, y: 34, category: '风景' },
  { id: 'main',   name: '主楼广场',   x: 48, y: 46, category: '教学' },
  { id: 'newmain',name: '新主楼',     x: 71, y: 45, category: '教学' },
  { id: 'field',  name: '田径场',     x: 41, y: 66, category: '运动' },
  { id: 'gym',    name: '体育馆',     x: 70, y: 63, category: '运动' },
  { id: 'canteen',name: '食堂街',     x: 51, y: 83, category: '生活' },
  { id: 'dorm',   name: '宿舍区',     x: 17, y: 62, category: '生活' },
  { id: 'ginkgo', name: '银杏大道',   x: 26, y: 88, category: '风景' },
  { id: 'woods',  name: '南园树林',   x: 79, y: 85, category: '风景' },
  { id: 'cafe',   name: '咖啡角',     x: 84, y: 30, category: '生活' },
  { id: 'lab',    name: '实验楼群',   x: 60, y: 20, category: '教学' },
  { id: 'north',  name: '北门',       x: 52, y: 6,  category: '出入口' },
  { id: 'south',  name: '南门',       x: 52, y: 96, category: '出入口' },
]

export const getLocation = (id: string) => LOCATIONS.find(l => l.id === id)
