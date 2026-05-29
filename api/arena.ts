import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import { chatCompletion, extractFirstJson } from './_lib/zhihu.js'
import { arenaBotPersona, isBotUserId, makeArenaBot } from './_lib/bots.js'

const CATEGORIES = ['人文', '科技', '教育', '生物科学']

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

async function generateDebate(supabase: any, topicId: string) {
  // Get topic info
  const { data: topic } = await supabase
    .from('arena_topics')
    .select('*')
    .eq('id', topicId)
    .single()
  if (!topic) throw new Error('Topic not found')

  // Get participants with their skills
  const { data: participants } = await supabase
    .from('arena_participants')
    .select('user_id, user_name, user_avatar, side, debater_pos')
    .eq('topic_id', topicId)
    .order('side').order('debater_pos')

  if (!participants || participants.length < 6) throw new Error('Not enough participants')

  // Get skill_markdowns for each participant
  const userIds = participants.map((p: any) => p.user_id)
  const { data: skills } = await supabase
    .from('user_distillation_results')
    .select('user_id, skill_desc, skill_markdown')
    .in('user_id', userIds)

  const skillMap: Record<string, { desc: string; markdown: string }> = {}
  for (const s of (skills || [])) {
    skillMap[s.user_id] = { desc: s.skill_desc || '', markdown: s.skill_markdown || '' }
  }

  const aff = participants.filter((p: any) => p.side === 'affirmative').sort((a: any, b: any) => a.debater_pos - b.debater_pos)
  const neg = participants.filter((p: any) => p.side === 'negative').sort((a: any, b: any) => a.debater_pos - b.debater_pos)

  const describeDebater = (p: any) => {
    const skill = skillMap[p.user_id]
    const style = isBotUserId(p.user_id)
      ? arenaBotPersona()
      : (skill?.desc ? skill.desc.slice(0, 80) : '知乎答主')
    return `${p.user_name}（风格：${style}）`
  }

  const debatePrompt = `你是辩论赛AI主持人，负责以参与者的口吻生成一场精彩的辩论。

辩论题目：${topic.title}
正方立场：${topic.affirmative_view}
反方立场：${topic.negative_view}

正方辩手：
- 一辩：${describeDebater(aff[0])}
- 二辩：${describeDebater(aff[1])}
- 三辩：${describeDebater(aff[2])}

反方辩手：
- 一辩：${describeDebater(neg[0])}
- 二辩：${describeDebater(neg[1])}
- 三辩：${describeDebater(neg[2])}

请按以下顺序生成辩论发言，每段发言要体现该辩手的个人风格特点：

第一轮（开场陈词）：
1. 正方一辩（120-150字）
2. 反方一辩（120-150字）
3. 正方二辩（90-120字）
4. 反方二辩（90-120字）
5. 正方三辩（90-120字）
6. 反方三辩（90-120字）

第二轮（交锋反驳）：
7-12. 同上顺序，每人70-100字，要点对上一轮对方论点进行反驳

第三轮（总结收尾）：
13-18. 同上顺序，每人60-80字，进行最终总结

然后作为裁判给出胜方判断。

完整输出格式（只输出JSON）：
{
  "turns": [
    {"side": "affirmative", "position": 1, "round": 1, "user_id": "${aff[0]?.user_id}", "user_name": "${aff[0]?.user_name}", "user_avatar": "${aff[0]?.user_avatar || ''}", "content": "发言内容"},
    ...
  ],
  "winner": "affirmative",
  "judgement": "裁判评语（100字以内）"
}`

  const result = await chatCompletion(
    [
      { role: 'system', content: '你是一个辩论赛AI主持人，擅长模拟真实的辩论场景，每位辩手的发言要体现不同的个性和风格。' },
      { role: 'user', content: debatePrompt }
    ],
    { temperature: 0.8, timeoutMs: 180_000, maxRetries: 1 }
  )

  const debateData = extractFirstJson<{
    turns: Array<{
      side: string; position: number; round: number;
      user_id: string; user_name: string; user_avatar: string; content: string
    }>;
    winner: string; judgement: string
  }>(result.content)

  if (!debateData) throw new Error('Failed to parse debate result')

  // Save to DB
  await supabase.from('arena_topics').update({
    status: 'completed',
    debate_transcript: debateData.turns,
    winner: debateData.winner,
    ai_judgement: debateData.judgement
  }).eq('id', topicId)

  // Award scores: winners +2, losers -1
  if (debateData.winner === 'affirmative' || debateData.winner === 'negative') {
    const weekKey = topic.week_key
    for (const p of participants) {
      // 冷启动的路人分身不计入周积分榜
      if (isBotUserId(p.user_id)) continue
      const delta = p.side === debateData.winner ? 2 : -1

      // Ensure row exists first (insert if missing)
      await supabase.from('user_scores').upsert({
        user_id: p.user_id,
        user_name: p.user_name,
        user_avatar: p.user_avatar || null,
        week_key: weekKey,
        score: 0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,week_key', ignoreDuplicates: true })

      // Read + update with delta
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

  return debateData
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

  // 满 6 人即开辩（与真实满员逻辑一致；也可重试此前卡在 open 的满员辩题）
  if (existing.length + inserts.length >= 6) {
    await supabase.from('arena_topics').update({ status: 'debating' }).eq('id', topicId)
    generateDebate(supabase, topicId).catch(async (e) => {
      console.error('[arena] cold-start debate generation failed', e)
      await supabase.from('arena_topics').update({ status: 'open' }).eq('id', topicId)
    })
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
          // Start debate generation in the background — don't block the join response
          await supabase.from('arena_topics').update({ status: 'debating' }).eq('id', topic_id)
          generateDebate(supabase, topic_id).catch(async (e) => {
            console.error('[arena] debate generation failed', e)
            await supabase.from('arena_topics').update({ status: 'open' }).eq('id', topic_id)
          })
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

        await supabase.from('arena_topics').update({ status: 'debating' }).eq('id', topic_id)
        const debateData = await generateDebate(supabase, topic_id)
        return json(res, 200, { ok: true, winner: debateData.winner })
      }

      return badRequest(res, 'unknown action')
    }

    return badRequest(res, 'method not allowed')
  } catch (err) {
    return serverError(res, err)
  }
}
