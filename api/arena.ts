import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import { chatCompletion, extractFirstJson } from './_lib/zhihu.js'
import { arenaBotPersona, isBotUserId, makeArenaBot } from './_lib/bots.js'

// Vercel：一次请求最多生成「一轮」发言，控制在函数最大时长内即可。
export const maxDuration = 60

const CATEGORIES = ['人文', '科技', '教育', '生物科学']

type DebateTurn = {
  side: string; position: number; round: number
  user_id: string; user_name: string; user_avatar: string; content: string
}

const TOTAL_ROUNDS = 3
const TURNS_PER_ROUND = 6
const TOTAL_TURNS = TOTAL_ROUNDS * TURNS_PER_ROUND

// 晚 8 点开始辩论
function isArenaDebateTime(): boolean {
  return new Date().getUTCHours() + 8 >= 20 // 8pm CST
}

function getWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

function getDayKey(date = new Date()): string {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
    .toISOString().slice(0, 10)
}

async function fetchZhihuHotList(hours = 24): Promise<string[]> {
  const DEVELOPER_BASE = 'https://developer.zhihu.com'
  const appSecret = (process.env.ZHIHU_APP_SECRET || '').trim()
  if (!appSecret) return []
  try {
    const url = new URL(`${DEVELOPER_BASE}/api/v1/content/hot_list`)
    url.searchParams.set('hours', String(hours))
    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${appSecret}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      }
    })
    if (!res.ok) return []
    const j: any = await res.json()
    if (j.Code !== 0 && j.code !== 0) return []
    const items: any[] = j.Data?.Items || j.data?.items || j.data || []
    return items
      .map((it: any) => it.Title || it.title || it.question?.title || '')
      .filter(Boolean)
      .slice(0, 20)
  } catch {
    return []
  }
}

async function ensureDailyTopics(supabase: any, dayKey: string) {
  const { data: existing } = await supabase
    .from('arena_topics')
    .select('category')
    .eq('week_key', dayKey)
  const existingCats = new Set((existing || []).map((t: any) => t.category))
  const missing = CATEGORIES.filter(c => !existingCats.has(c))
  if (missing.length === 0) return

  // Try to get hot list topics to inspire debate topics
  const hotTopics = await fetchZhihuHotList(24)
  const hotContext = hotTopics.length > 0
    ? `\n\n参考今日知乎热榜话题（从中汲取灵感出辩题，要有正反方对立）：\n${hotTopics.slice(0, 10).map((t, i) => `${i + 1}. ${t}`).join('\n')}`
    : ''

  const prompt = `你是一个辩论赛题目策划人。今天是 ${dayKey}，请为以下类别各生成一个辩论题目。
要求：
- 题目必须适合"正方 vs 反方"的二元对立辩论（不能是开放式问题）
- 使用"应不应该"/"是不是"/"会不会"/"X 比 Y 更…"等可以明确站队的句式
- 具有争议性和时代感，适合 2026 年当下语境
- 每个类别独立成题${hotContext}

类别：${missing.join('、')}

只输出 JSON 数组：
[
  {
    "category": "类别名",
    "title": "辩论题目（20字以内）",
    "affirmative_view": "正方立场（15字以内）",
    "negative_view": "反方立场（15字以内）"
  }
]`

  try {
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.85, timeoutMs: 30_000 }
    )
    const topics = extractFirstJson<Array<{
      category: string; title: string; affirmative_view: string; negative_view: string
    }>>(result.content) || []

    const rows = topics.map(t => ({
      category: t.category,
      title: t.title,
      affirmative_view: t.affirmative_view,
      negative_view: t.negative_view,
      week_key: dayKey,
      status: 'open'
    }))

    if (rows.length > 0) {
      await supabase.from('arena_topics').insert(rows)
    }
  } catch (e) {
    const fallbacks: Record<string, { title: string; affirmative_view: string; negative_view: string }> = {
      '人文': { title: 'AI 创作应被认定为真正的艺术吗', affirmative_view: '应该，AI 艺术代表创意新边界', negative_view: '不应该，真正艺术源于人类情感' },
      '科技': { title: '大模型的涌现能力是真实质变还是幻觉', affirmative_view: '是真实质变，代表智能新层级', negative_view: '是统计幻觉，本质仍是模式匹配' },
      '教育': { title: '全面推广 AI 辅助学习会让学生更聪明吗', affirmative_view: '会，AI 释放认知带宽提升思维', negative_view: '不会，反而会侵蚀独立思考能力' },
      '生物科学': { title: '基因编辑应该被允许用于人类胚胎增强吗', affirmative_view: '应该，是消除遗传疾病的进步', negative_view: '不应该，带来不可控伦理风险' }
    }
    const fallbackRows = missing.filter(c => fallbacks[c]).map(c => ({
      category: c,
      title: fallbacks[c].title,
      affirmative_view: fallbacks[c].affirmative_view,
      negative_view: fallbacks[c].negative_view,
      week_key: dayKey,
      status: 'open'
    }))
    if (fallbackRows.length > 0) {
      await supabase.from('arena_topics').insert(fallbackRows)
    }
  }
}

const ROUND_GUIDE: Record<number, string> = {
  1: '开场陈词——亮明本方立场，给出最有力的核心论据',
  2: '交锋反驳——针对前面对方辩手的具体论点进行有力反驳',
  3: '总结收尾——总结并升华本方立场，给出有力的结辩',
}
const ROUND_LEN: Record<number, string> = { 1: '100-150字', 2: '70-100字', 3: '60-80字' }

function debaterStyle(p: any, skillMap: Record<string, { desc: string; markdown: string }>): string {
  const skill = skillMap[p.user_id]
  return isBotUserId(p.user_id)
    ? arenaBotPersona()
    : (skill?.desc ? skill.desc.slice(0, 80) : '知乎答主')
}

// 生成「单个辩手的一段发言」。每次只生成一条，调用极快（数秒），即使函数最大时长很短也能稳定完成；
// 只输出发言正文（不走 JSON 解析），最大限度避免格式解析失败导致的「永远生成不出来」。
async function generateOneTurn(
  topic: any,
  speaker: any,
  side: string,
  position: number,
  round: number,
  priorTurns: DebateTurn[],
  skillMap: Record<string, { desc: string; markdown: string }>
): Promise<string> {
  const sideCn = side === 'affirmative' ? '正方' : '反方'
  const stance = side === 'affirmative' ? topic.affirmative_view : topic.negative_view
  const priorText = priorTurns.length > 0
    ? `\n\n【已进行的发言（请承接上下文、避免与前面重复）】\n` + priorTurns.map(t =>
        `第${t.round}轮·${t.side === 'affirmative' ? '正方' : '反方'}${t.position}辩 ${t.user_name}：${t.content}`
      ).join('\n')
    : ''

  const prompt = `这是一场辩论赛。
辩题：${topic.title}
正方立场：${topic.affirmative_view}
反方立场：${topic.negative_view}

现在轮到【${sideCn}${position}辩 ${speaker.user_name}】发言：
- 立场：${sideCn}（${stance}）
- 风格：${debaterStyle(speaker, skillMap)}
- 环节：第 ${round} 轮 · ${ROUND_GUIDE[round]}
- 字数：${ROUND_LEN[round]}${priorText}

请直接以 ${speaker.user_name} 的口吻输出这一段发言正文，体现其风格。不要加「${speaker.user_name}：」之类前缀，不要引号，不要任何解释。`

  const result = await chatCompletion(
    [
      { role: 'system', content: '你是辩论赛辩手代写，只输出该辩手这一轮的发言正文，简洁有力、有鲜明个人风格。' },
      { role: 'user', content: prompt }
    ],
    { temperature: 0.85, timeoutMs: 25_000, maxRetries: 1 }
  )

  let content = (result.content || '').trim()
  content = content.replace(/^["「『]+/, '').replace(/["」』]+$/, '').trim()
  const prefix = `${speaker.user_name}：`
  if (content.startsWith(prefix)) content = content.slice(prefix.length).trim()
  const prefix2 = `${speaker.user_name}:`
  if (content.startsWith(prefix2)) content = content.slice(prefix2.length).trim()
  return content
}

// 辩论全部 3 轮完成后：让 AI 裁判判定胜负并结算积分。
// 用「条件更新（status != completed）」抢占结算，确保并发下只结算一次。
async function finalizeDebate(supabase: any, topic: any, turns: DebateTurn[]): Promise<void> {
  let winner = 'tie'
  let judgement = ''
  try {
    const transcript = turns.map(t =>
      `第${t.round}轮·${t.side === 'affirmative' ? '正方' : '反方'}${t.position}辩 ${t.user_name}：${t.content}`
    ).join('\n')
    const result = await chatCompletion(
      [
        { role: 'system', content: '你是专业的辩论赛裁判，公正、犀利地评判胜负。' },
        { role: 'user', content: `辩论题目：${topic.title}\n正方立场：${topic.affirmative_view}\n反方立场：${topic.negative_view}\n\n完整辩论记录：\n${transcript}\n\n请判断哪一方获胜，并给出评语。只输出 JSON：{"winner": "affirmative" | "negative" | "tie", "judgement": "裁判评语（100字以内）"}` }
      ],
      { temperature: 0.4, timeoutMs: 40_000, maxRetries: 1 }
    )
    const j = extractFirstJson<{ winner: string; judgement: string }>(result.content)
    if (j) {
      winner = ['affirmative', 'negative', 'tie'].includes(j.winner) ? j.winner : 'tie'
      judgement = String(j.judgement || '').slice(0, 300)
    }
  } catch (e) {
    console.error('[arena] judgement failed', e)
  }

  // 抢占结算：只有把 status 从非 completed 改成 completed 成功的那个 worker 才结算积分
  const { data: claimed } = await supabase.from('arena_topics')
    .update({ status: 'completed', winner, ai_judgement: judgement })
    .eq('id', topic.id)
    .neq('status', 'completed')
    .select('id')
  if (!claimed || claimed.length === 0) return // 已被其他请求结算

  if (winner !== 'affirmative' && winner !== 'negative') return

  // 结算积分：胜方 +2，负方 -1（路人分身不计入榜单）
  const { data: participants } = await supabase
    .from('arena_participants')
    .select('user_id, user_name, user_avatar, side')
    .eq('topic_id', topic.id)
  // topic.week_key 存的是日期字符串（YYYY-MM-DD），需转换为 ISO 周键以匹配排行榜查询
  const weekKey = getWeekKey(new Date(topic.week_key))
  for (const p of (participants || [])) {
    if (isBotUserId(p.user_id)) continue
    const delta = p.side === winner ? 2 : -1
    await supabase.from('user_scores').upsert({
      user_id: p.user_id,
      user_name: p.user_name,
      user_avatar: p.user_avatar || null,
      week_key: weekKey,
      score: 0,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,week_key', ignoreDuplicates: true })
    const { data: cur } = await supabase
      .from('user_scores')
      .select('score')
      .eq('user_id', p.user_id)
      .eq('week_key', weekKey)
      .single()
    await supabase.from('user_scores').update({
      score: (cur?.score || 0) + delta,
      updated_at: new Date().toISOString()
    }).eq('user_id', p.user_id).eq('week_key', weekKey)
  }
}

// 推进一场辩论「一步」：生成下一位辩手的一段发言并落库；18 条满则结算。
// 每次只生成一条，调用快、稳，适配 serverless 无后台任务、且函数最大时长可能很短的限制。
// 可重复调用、可断点续传（以已落库发言条数为进度依据），由前端轮询 / 定时任务触发。
// 返回 done=该辩论是否已完结、advanced=本次是否真的产出了一条发言。
async function advanceDebate(supabase: any, topicId: string): Promise<{ done: boolean; advanced: boolean }> {
  const { data: topic } = await supabase
    .from('arena_topics')
    .select('*')
    .eq('id', topicId)
    .single()
  if (!topic) return { done: true, advanced: false }
  if (topic.status === 'completed') return { done: true, advanced: false }
  if (topic.status !== 'debating') return { done: true, advanced: false }

  const { data: participants } = await supabase
    .from('arena_participants')
    .select('user_id, user_name, user_avatar, side, debater_pos')
    .eq('topic_id', topicId)
    .order('side').order('debater_pos')

  const aff = (participants || []).filter((p: any) => p.side === 'affirmative').sort((a: any, b: any) => a.debater_pos - b.debater_pos)
  const neg = (participants || []).filter((p: any) => p.side === 'negative').sort((a: any, b: any) => a.debater_pos - b.debater_pos)
  if (aff.length < 3 || neg.length < 3) return { done: false, advanced: false }

  const turns: DebateTurn[] = Array.isArray(topic.debate_transcript) ? topic.debate_transcript : []

  // 18 条已满 → 结算
  if (turns.length >= TOTAL_TURNS) {
    if (!topic.winner) await finalizeDebate(supabase, topic, turns)
    return { done: true, advanced: false }
  }

  // 计算下一位发言者：每轮顺序为 正一、反一、正二、反二、正三、反三
  const idx = turns.length
  const round = Math.floor(idx / TURNS_PER_ROUND) + 1
  const posInRound = idx % TURNS_PER_ROUND
  const side = posInRound % 2 === 0 ? 'affirmative' : 'negative'
  const position = Math.floor(posInRound / 2) + 1
  const speaker = side === 'affirmative' ? aff[position - 1] : neg[position - 1]
  if (!speaker) return { done: false, advanced: false }

  // 拉取本场辩手的蒸馏画像
  const userIds = (participants || []).map((p: any) => p.user_id)
  const { data: skills } = await supabase
    .from('user_distillation_results')
    .select('user_id, skill_desc, skill_markdown')
    .in('user_id', userIds)
  const skillMap: Record<string, { desc: string; markdown: string }> = {}
  for (const s of (skills || [])) {
    skillMap[s.user_id] = { desc: s.skill_desc || '', markdown: s.skill_markdown || '' }
  }

  const content = await generateOneTurn(topic, speaker, side, position, round, turns, skillMap)
  if (!content) throw new Error(`empty turn content at idx ${idx}`)

  const newTurn: DebateTurn = {
    side, position, round,
    user_id: speaker.user_id,
    user_name: speaker.user_name,
    user_avatar: speaker.user_avatar || '',
    content,
  }

  // 落库前去重：重新读取，若进度已被其他请求推进则放弃本次（避免并发重复写入同一条）
  const { data: fresh } = await supabase
    .from('arena_topics')
    .select('debate_transcript, status')
    .eq('id', topicId)
    .single()
  if (!fresh || fresh.status !== 'debating') return { done: fresh?.status === 'completed', advanced: false }
  const curTurns: DebateTurn[] = Array.isArray(fresh.debate_transcript) ? fresh.debate_transcript : []
  if (curTurns.length !== idx) return { done: false, advanced: false } // 已被其他请求推进

  const updated = [...curTurns, newTurn]
  await supabase.from('arena_topics')
    .update({ debate_transcript: updated })
    .eq('id', topicId)

  if (updated.length >= TOTAL_TURNS) {
    await finalizeDebate(supabase, topic, updated)
    return { done: true, advanced: true }
  }
  return { done: false, advanced: true }
}

// 冷启动：晚 8 点若某辩题正反方人数不足，自动补充「爱吵架的路人」数字分身，
// 凑齐正反各 3 人后开辩。返回是否对该辩题做了改动（用于触发上层重新读取）。
async function fillTopicWithBots(supabase: any, topicId: string): Promise<boolean> {
  const { data: parts } = await supabase
    .from('arena_participants')
    .select('side, debater_pos, user_name')
    .eq('topic_id', topicId)

  const existing = parts || []
  const usedWords = new Set<string>(
    existing
      .map((p: any) => p.user_name || '')
      .filter((n: string) => n.startsWith('爱吵架的路人'))
      .map((n: string) => n.replace('爱吵架的路人', ''))
  )

  const inserts: any[] = []
  for (const side of ['affirmative', 'negative'] as const) {
    const takenPos = new Set(
      existing.filter((p: any) => p.side === side).map((p: any) => p.debater_pos)
    )
    for (const pos of [1, 2, 3]) {
      if (takenPos.has(pos)) continue
      const bot = makeArenaBot(usedWords)
      inserts.push({
        topic_id: topicId,
        user_id: bot.user_id,
        user_name: bot.user_name,
        user_avatar: bot.user_avatar,
        side,
        debater_pos: pos,
      })
    }
  }

  let changed = false
  if (inserts.length > 0) {
    const { error } = await supabase.from('arena_participants').insert(inserts)
    if (error) {
      // 并发下可能撞唯一约束，交给下一次触发重试
      console.error('[arena] cold-start insert failed', error.message)
      return false
    }
    changed = true
  }

  // 满 6 人即开辩（与真实满员逻辑一致；也可重试此前卡在 open 的满员辩题）。
  // 注意：发言由前端轮询逐轮生成（见 advanceDebate），这里只负责把状态置为 debating，
  // 不能在此 fire-and-forget 触发生成——serverless 在响应返回后会冻结，后台 Promise 不会跑完。
  if (existing.length + inserts.length >= 6) {
    await supabase.from('arena_topics')
      .update({ status: 'debating' })
      .eq('id', topicId)
      .eq('status', 'open')
    changed = true
  }

  return changed
}

async function ensureArenaColdStart(supabase: any, topics: any[]): Promise<boolean> {
  if (!isArenaDebateTime()) return false
  let changed = false
  for (const topic of topics) {
    if (topic.status !== 'open') continue
    if (await fillTopicWithBots(supabase, topic.id)) changed = true
  }
  return changed
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'DB 未配置' })

    const weekKey = getWeekKey()
    const dayKey = getDayKey()

    if (req.method === 'GET') {
      const { topicId, action } = req.query as Record<string, string>

      // 在时间预算内，轮转推进今日所有「辩论中」的辩题（每个 topic 每次一条发言）。
      // 供定时任务（cold-start.yml）在 8 点后主动驱动生成直至完成，
      // 确保即使没有访客打开页面也能逐条产出发言。
      if (action === 'advance') {
        const { data: debating } = await supabase
          .from('arena_topics')
          .select('id')
          .eq('week_key', dayKey)
          .eq('status', 'debating')
        const active = new Set<string>((debating || []).map((t: any) => t.id))
        const deadline = Date.now() + 45_000 // 控制在函数最大时长内
        while (active.size > 0 && Date.now() < deadline) {
          for (const id of Array.from(active)) {
            if (Date.now() >= deadline) break
            try {
              const r = await advanceDebate(supabase, id)
              if (r.done) active.delete(id)
            } catch (e) {
              console.error('[arena] advance_all failed', e)
              // 留在集合中，下一轮 / 下次请求再试
            }
          }
        }
        const { data: still } = await supabase
          .from('arena_topics')
          .select('id')
          .eq('week_key', dayKey)
          .eq('status', 'debating')
        return json(res, 200, { in_progress: (still || []).length > 0 })
      }

      // Leaderboard (merged from leaderboard.ts)
      if (action === 'leaderboard') {
        const session = readSession(req)
        const { data: scores } = await supabase
          .from('user_scores')
          .select('user_id, user_name, user_avatar, score, updated_at')
          .eq('week_key', weekKey)
          .order('score', { ascending: false })
          .limit(50)
        const ranked = (scores || []).map((s: any, i: number) => ({ ...s, rank: i + 1 }))
        const my_rank = session
          ? (ranked.findIndex((r: any) => r.user_id === session.user_id) + 1) || null
          : null
        return json(res, 200, { scores: ranked, week_key: weekKey, my_rank })
      }

      if (topicId) {
        // 进行中的辩论：每次拉取时推进一轮发言生成（前端轮询驱动，断点续传）
        await advanceDebate(supabase, topicId).catch(e => console.error('[arena] advance failed', e))

        // Get specific topic
        const [topicResult, participantsResult] = await Promise.all([
          supabase.from('arena_topics').select('*').eq('id', topicId).single(),
          supabase.from('arena_participants').select('*').eq('topic_id', topicId).order('side').order('debater_pos')
        ])
        if (topicResult.error) return json(res, 404, { error: '题目不存在' })
        return json(res, 200, {
          topic: topicResult.data,
          participants: participantsResult.data || []
        })
      }

      // List current day's topics (daily refresh)
      await ensureDailyTopics(supabase, dayKey)

      const fetchTopics = () => supabase
        .from('arena_topics')
        .select('id, category, title, affirmative_view, negative_view, week_key, status, winner, ai_judgement')
        .eq('week_key', dayKey)
        .order('category')

      let { data: topics } = await fetchTopics()

      // 冷启动：晚 8 点后人数不足的辩题，自动补满路人分身并开辩
      if (await ensureArenaColdStart(supabase, topics || [])) {
        ;({ data: topics } = await fetchTopics())
      }

      const { data: allParticipants } = await supabase
        .from('arena_participants')
        .select('topic_id, side, debater_pos, user_id, user_name, user_avatar')
        .in('topic_id', (topics || []).map((t: any) => t.id))

      const partMap: Record<string, any[]> = {}
      for (const p of (allParticipants || [])) {
        if (!partMap[p.topic_id]) partMap[p.topic_id] = []
        partMap[p.topic_id].push(p)
      }

      const enriched = (topics || []).map((t: any) => ({
        ...t,
        participants: partMap[t.id] || [],
        aff_count: (partMap[t.id] || []).filter((p: any) => p.side === 'affirmative').length,
        neg_count: (partMap[t.id] || []).filter((p: any) => p.side === 'negative').length
      }))

      return json(res, 200, { topics: enriched, week_key: weekKey, date: dayKey })
    }

    if (req.method === 'POST') {
      const session = readSession(req)
      if (!session) return unauthorized(res, '请先登录')

      const body = await readBody<{
        action: string; topic_id?: string; side?: string
      }>(req)

      if (body.action === 'join') {
        const { topic_id, side } = body
        if (!topic_id || !side) return badRequest(res, '缺少参数')
        if (!['affirmative', 'negative'].includes(side)) return badRequest(res, '无效的 side')

        // Check user has digital twin
        const { data: twin } = await supabase
          .from('user_distillation_results')
          .select('user_id, skill_markdown')
          .eq('user_id', session.user_id)
          .maybeSingle()

        if (!twin?.skill_markdown) {
          return json(res, 403, { error: '你还没有数字分身，请先在「我的蒸馏」页面完成蒸馏' })
        }

        // Get topic
        const { data: topic } = await supabase
          .from('arena_topics')
          .select('*')
          .eq('id', topic_id)
          .single()
        if (!topic) return json(res, 404, { error: '题目不存在' })
        if (topic.status !== 'open') return json(res, 409, { error: '该题目已满员或已结束' })

        // Check user not already joined
        const { data: existing } = await supabase
          .from('arena_participants')
          .select('id')
          .eq('topic_id', topic_id)
          .eq('user_id', session.user_id)
          .maybeSingle()
        if (existing) return json(res, 409, { error: '你已加入该题目' })

        // Find next available position
        const { data: sideParticipants } = await supabase
          .from('arena_participants')
          .select('debater_pos')
          .eq('topic_id', topic_id)
          .eq('side', side)
        const takenPos = new Set((sideParticipants || []).map((p: any) => p.debater_pos))
        const nextPos = [1, 2, 3].find(p => !takenPos.has(p))
        if (!nextPos) return json(res, 409, { error: '该方已满（最多3人）' })

        // Join
        const { error: joinErr } = await supabase.from('arena_participants').insert({
          topic_id,
          user_id: session.user_id,
          user_name: session.user_name,
          user_avatar: session.avatar_url || null,
          side,
          debater_pos: nextPos
        })
        if (joinErr) return serverError(res, new Error(joinErr.message))

        // Check if topic is now full (3 per side = 6 total)
        const { count: totalCount } = await supabase
          .from('arena_participants')
          .select('id', { count: 'exact', head: true })
          .eq('topic_id', topic_id)

        if ((totalCount || 0) >= 6) {
          // 满员即开辩：仅置状态为 debating。发言由前端轮询逐轮生成（advanceDebate），
          // 不在此处 fire-and-forget，否则 serverless 响应返回后后台任务会被冻结、无法跑完。
          await supabase.from('arena_topics')
            .update({ status: 'debating' })
            .eq('id', topic_id)
            .eq('status', 'open')
        }

        return json(res, 200, {
          joined: true,
          side,
          debater_pos: nextPos,
          total_participants: totalCount || 0
        })
      }

      if (body.action === 'trigger_debate') {
        // Manually trigger debate (for testing / when status is stuck)
        const { topic_id } = body
        if (!topic_id) return badRequest(res, '缺少 topic_id')

        const { data: topic } = await supabase
          .from('arena_topics')
          .select('status')
          .eq('id', topic_id)
          .single()
        if (!topic) return json(res, 404, { error: '题目不存在' })

        await supabase.from('arena_topics')
          .update({ status: 'debating' })
          .eq('id', topic_id)
          .neq('status', 'completed')

        // 逐条推进直到结算完成（手动/兜底用；上限留足冗余）
        for (let i = 0; i < TOTAL_TURNS + 2; i++) {
          const r = await advanceDebate(supabase, topic_id)
          if (r.done) break
        }

        const { data: done } = await supabase
          .from('arena_topics')
          .select('status, winner')
          .eq('id', topic_id)
          .single()
        return json(res, 200, { ok: true, status: done?.status, winner: done?.winner ?? null })
      }

      if (body.action === 'test_fill') {
        // Dev/test: 填充所有今日 open/debating 辩题的路人，绕过 8pm 时间检查
        const { data: todayTopics } = await supabase
          .from('arena_topics')
          .select('id, status')
          .eq('week_key', dayKey)

        const filled: string[] = []
        for (const t of (todayTopics || [])) {
          if (t.status === 'completed') continue
          await fillTopicWithBots(supabase, t.id)
          await supabase.from('arena_topics')
            .update({ status: 'debating' })
            .eq('id', t.id)
            .neq('status', 'completed')
          filled.push(t.id)
        }
        return json(res, 200, {
          ok: true,
          filled,
          message: `已填充并启动 ${filled.length} 场辩论，刷新页面即可看到进度`
        })
      }

      return badRequest(res, 'unknown action')
    }

    return badRequest(res, 'method not allowed')
  } catch (err) {
    return serverError(res, err)
  }
}
