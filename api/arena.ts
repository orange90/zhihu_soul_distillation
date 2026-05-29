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

const ROUND_INFO: Record<number, { name: string; guide: string }> = {
  1: { name: '开场陈词', guide: '正方一辩、反方一辩各 120-150 字，正方二/三辩、反方二/三辩各 90-120 字；亮明立场，给出核心论据' },
  2: { name: '交锋反驳', guide: '每人 70-100 字，针对上一轮对方的具体论点进行有力反驳' },
  3: { name: '总结收尾', guide: '每人 60-80 字，进行最终总结陈词，升华本方立场' },
}

function describeDebater(p: any, skillMap: Record<string, { desc: string; markdown: string }>): string {
  const skill = skillMap[p.user_id]
  const style = isBotUserId(p.user_id)
    ? arenaBotPersona()
    : (skill?.desc ? skill.desc.slice(0, 80) : '知乎答主')
  return `${p.user_name}（风格：${style}）`
}

// 生成「某一轮」的 6 段发言。发言人的身份信息以参数中的辩手为准（不信任 LLM 返回的 user_id），
// 只取 LLM 生成的 content，避免身份错乱。
async function generateDebateRound(
  topic: any,
  aff: any[],
  neg: any[],
  skillMap: Record<string, { desc: string; markdown: string }>,
  priorTurns: DebateTurn[],
  round: number
): Promise<DebateTurn[]> {
  // 发言顺序：正一、反一、正二、反二、正三、反三
  const order = [
    { side: 'affirmative', p: aff[0] }, { side: 'negative', p: neg[0] },
    { side: 'affirmative', p: aff[1] }, { side: 'negative', p: neg[1] },
    { side: 'affirmative', p: aff[2] }, { side: 'negative', p: neg[2] },
  ]
  const info = ROUND_INFO[round]
  const priorText = priorTurns.length > 0
    ? `\n\n【已进行的发言（请承接上下文、避免重复）】\n` + priorTurns.map(t =>
        `第${t.round}轮·${t.side === 'affirmative' ? '正方' : '反方'}${t.position}辩 ${t.user_name}：${t.content}`
      ).join('\n')
    : ''

  const speakerLines = order.map((o, i) =>
    `${i + 1}. ${o.side === 'affirmative' ? '正方' : '反方'}${Math.floor(i / 2) + 1}辩 ${describeDebater(o.p, skillMap)}`
  ).join('\n')

  const prompt = `你是辩论赛AI主持人，正在主持一场辩论。

辩论题目：${topic.title}
正方立场：${topic.affirmative_view}
反方立场：${topic.negative_view}

本轮是【第 ${round} 轮 · ${info.name}】，请严格按以下顺序生成 6 段发言（共 6 条，不多不少）：
${speakerLines}

字数与要求：${info.guide}。每段要体现该辩手的个人风格特点。${priorText}

只输出一个 JSON 数组，长度必须为 6，顺序与上面一致：
[
  {"content": "第1位（正方一辩）的发言"},
  {"content": "第2位（反方一辩）的发言"},
  ... 共 6 条 ...
]`

  const result = await chatCompletion(
    [
      { role: 'system', content: '你是一个辩论赛AI主持人，擅长模拟真实辩论场景，每位辩手的发言要体现不同的个性与风格。' },
      { role: 'user', content: prompt }
    ],
    { temperature: 0.8, timeoutMs: 50_000, maxRetries: 1 }
  )

  const arr = extractFirstJson<Array<{ content?: string }>>(result.content) || []
  const turns: DebateTurn[] = order.map((o, i) => ({
    side: o.side,
    position: Math.floor(i / 2) + 1,
    round,
    user_id: o.p.user_id,
    user_name: o.p.user_name,
    user_avatar: o.p.user_avatar || '',
    content: String(arr[i]?.content || '').trim(),
  }))

  if (turns.some(t => !t.content)) {
    throw new Error(`round ${round} generation incomplete (got ${arr.length} items)`)
  }
  return turns
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
  const weekKey = topic.week_key
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

// 推进一场辩论「一步」：生成下一轮发言（6 条）并落库；若 3 轮已满则结算。
// 可重复调用、可断点续传（以已落库的发言条数为进度依据），适配 serverless 无后台任务的限制。
// 由前端轮询触发，每次请求只做一轮，保证在函数最大时长内完成。
async function advanceDebate(supabase: any, topicId: string): Promise<void> {
  const { data: topic } = await supabase
    .from('arena_topics')
    .select('*')
    .eq('id', topicId)
    .single()
  if (!topic || topic.status !== 'debating') return

  const { data: participants } = await supabase
    .from('arena_participants')
    .select('user_id, user_name, user_avatar, side, debater_pos')
    .eq('topic_id', topicId)
    .order('side').order('debater_pos')

  const aff = (participants || []).filter((p: any) => p.side === 'affirmative').sort((a: any, b: any) => a.debater_pos - b.debater_pos)
  const neg = (participants || []).filter((p: any) => p.side === 'negative').sort((a: any, b: any) => a.debater_pos - b.debater_pos)
  if (aff.length < 3 || neg.length < 3) return

  const turns: DebateTurn[] = Array.isArray(topic.debate_transcript) ? topic.debate_transcript : []

  // 三轮已满 → 结算
  if (turns.length >= TOTAL_TURNS) {
    if (!topic.winner) await finalizeDebate(supabase, topic, turns)
    return
  }

  // 进度容错：若已落库条数不是整轮（异常中断），回退到上一整轮边界重新生成本轮
  const round = Math.floor(turns.length / TURNS_PER_ROUND) + 1
  const expectedLen = (round - 1) * TURNS_PER_ROUND
  const priorTurns = turns.slice(0, expectedLen)

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

  const newTurns = await generateDebateRound(topic, aff, neg, skillMap, priorTurns, round)

  // 落库前去重：重新读取，若进度已被其他请求推进则放弃本次（避免并发重复写入同一轮）
  const { data: fresh } = await supabase
    .from('arena_topics')
    .select('debate_transcript, status')
    .eq('id', topicId)
    .single()
  if (!fresh || fresh.status !== 'debating') return
  const curTurns: DebateTurn[] = Array.isArray(fresh.debate_transcript) ? fresh.debate_transcript : []
  if (curTurns.length !== expectedLen) return // 已有其他请求生成了本轮

  const updated = [...priorTurns, ...newTurns]
  await supabase.from('arena_topics')
    .update({ debate_transcript: updated })
    .eq('id', topicId)

  if (updated.length >= TOTAL_TURNS) {
    await finalizeDebate(supabase, topic, updated)
  }
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

      // 推进今日所有「辩论中」的辩题各一轮（并行）。供定时任务（cold-start.yml）在 8 点后
      // 主动驱动生成直至完成，确保即使没有访客打开页面也能逐轮产出发言。
      if (action === 'advance') {
        const { data: debating } = await supabase
          .from('arena_topics')
          .select('id')
          .eq('week_key', dayKey)
          .eq('status', 'debating')
        const ids = (debating || []).map((t: any) => t.id)
        await Promise.all(
          ids.map((id: string) =>
            advanceDebate(supabase, id).catch(e => console.error('[arena] advance_all failed', e))
          )
        )
        const { data: still } = await supabase
          .from('arena_topics')
          .select('id')
          .eq('week_key', dayKey)
          .eq('status', 'debating')
        return json(res, 200, { advanced: ids.length, in_progress: (still || []).length > 0 })
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

        // 逐轮推进直到结算完成（手动/兜底用；最多 TOTAL_ROUNDS + 1 次）
        for (let i = 0; i < TOTAL_ROUNDS + 1; i++) {
          const { data: t } = await supabase
            .from('arena_topics')
            .select('status')
            .eq('id', topic_id)
            .single()
          if (t?.status === 'completed') break
          await advanceDebate(supabase, topic_id)
        }

        const { data: done } = await supabase
          .from('arena_topics')
          .select('status, winner')
          .eq('id', topic_id)
          .single()
        return json(res, 200, { ok: true, status: done?.status, winner: done?.winner ?? null })
      }

      return badRequest(res, 'unknown action')
    }

    return badRequest(res, 'method not allowed')
  } catch (err) {
    return serverError(res, err)
  }
}
