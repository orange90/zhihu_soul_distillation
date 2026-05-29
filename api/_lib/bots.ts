// 冷启动「数字分身」（bot）工具。
//
// 在学术酒吧 / 辩论场参与人数不足时，自动补充随机的数字分身，解决冷启动阶段
// 没有真实数据、场子冷清的问题。这些分身没有真实账户：
//   - user_id 统一以 BOT_PREFIX 开头，便于在计分、展示等环节识别；
//   - 没有蒸馏结果（user_distillation_results），发言/辩论时使用内置人设提示。

export const BOT_PREFIX = 'bot_'

export type Bot = { user_id: string; user_name: string; user_avatar: string }

export function isBotUserId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(BOT_PREFIX)
}

function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

// DiceBear 公共头像服务，按 seed 生成稳定的随机头像。
// 若该服务在浏览器侧不可达，前端 Avatar 组件会回退到首字母占位图。
export function randomAvatar(seed: string): string {
  return `https://api.dicebear.com/7.x/thumbs/svg?seed=${encodeURIComponent(seed)}`
}

// 学术酒吧的路人分身：统一显示为「路过进来看看的」，头像随机。
export function makeBarBot(): Bot {
  const seed = randomSeed()
  return {
    user_id: `${BOT_PREFIX}bar_${seed}`,
    user_name: '路过进来看看的',
    user_avatar: randomAvatar(seed),
  }
}

const ARENA_WORDS = [
  '番茄', '键盘', '量子', '月亮', '显微镜', '咖啡', '逻辑', '拓扑', '蒲公英', '闪电',
  '锅包肉', '薛定谔', '二极管', '北极熊', '奥卡姆', '中子星', '麦克斯韦', '芥末', '甜豆腐脑', '咸豆腐脑',
  '香菜', '折叠屏', '显卡', '咖啡因', '多巴胺', '熵增', '黑天鹅', '正态分布', '柠檬', '螺蛳粉',
]

// 辩论场的路人分身：「爱吵架的路人」+ 随机词，头像随机。
// used 用于在同一辩题内避免重名。
export function makeArenaBot(used: Set<string>): Bot {
  const available = ARENA_WORDS.filter(w => !used.has(w))
  const pool = available.length > 0 ? available : ARENA_WORDS
  const word = pool[Math.floor(Math.random() * pool.length)]
  used.add(word)
  const seed = randomSeed()
  return {
    user_id: `${BOT_PREFIX}arena_${seed}`,
    user_name: `爱吵架的路人${word}`,
    user_avatar: randomAvatar(seed),
  }
}

// 生成发言/辩论时给 bot 的人设提示（它们没有真实的蒸馏结果）。
export function barBotPersona(): string {
  return '路过的吃瓜群众，凑热闹随口聊两句，观点接地气、口语化'
}

export function arenaBotPersona(): string {
  return '爱抬杠的网友，立场鲜明、不服就辩，喜欢用犀利反问和生活化的例子怼人'
}
