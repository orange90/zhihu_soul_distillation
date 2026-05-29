import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import { chatCompletion, extractFirstJson } from './_lib/zhihu.js'

const CATEGORIES = ['人文', '科技', '教育', '数码', '生物科学']

function getWeekKey(date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

async function ensureWeekTopics(supabase: any, weekKey: string) {
  const { data: existing } = await supabase
    .from('arena_topics')
    .select('category')
    .eq('week_key', weekKey)
  const existingCats = new Set((existing || []).map((t: any) => t.category))
  const missing = CATEGORIES.filter(c => !existingCats.has(c))
  if (missing.length === 0) return

  const prompt = `你是一个辩论赛题目策划人。请为以下类别各生成一个高质量的辩论题目，话题应该具有争议性、思考深度，适合 2026 年当下的社会语境。

类别：${missing.join('、')}

对每个类别输出一个 JSON 对象，格式如下（所有类别放在同一个 JSON 数组中）：
[
  {
    "category": "类别名",
    "title": "辩论题目（20字以内，以"应不应该"/"是不是"/"会不会"等形式）",
    "affirmative_view": "正方立场（15字以内）",
    "negative_view": "反方立场（15字以内）"
  }
]

只输出 JSON 数组，不要其他内容。`

  try {
    const result = await chatCompletion(
      [{ role: 'user', content: prompt }],
      { temperature: 0.8, timeoutMs: 30_000 }
    )
    const topics = extractFirstJson<Array<{
      category: string; title: string; affirmative_view: string; negative_view: string
    }>>(result.content) || []

    const rows = topics.map(t => ({
      category: t.category,
      title: t.title,
      affirmative_view: t.affirmative_view,
      negative_view: t.negative_view,
      week_key: weekKey,
      status: 'open'
    }))

    if (rows.length > 0) {
      await supabase.from('arena_topics').insert(rows)
    }
  } catch (e) {
    // Fallback to hardcoded topics if AI fails
    const fallbacks: Record<string, { title: string; affirmative_view: string; negative_view: string }> = {
      '人文': { title: 'AI 创作应被认定为真正的艺术吗', affirmative_view: '应该，AI 艺术代表创意新边界', negative_view: '不应该，真正艺术源于人类情感' },
      '科技': { title: '大模型的涌现能力是真实质变还是幻觉', affirmative_view: '是真实质变，代表智能新层级', negative_view: '是统计幻觉，本质仍是模式匹配' },
      '教育': { title: '全面推广 AI 辅助学习会让学生更聪明吗', affirmative_view: '会，AI 释放认知带宽提升思维', negative_view: '不会，反而会侵蚀独立思考能力' },
      '数码': { title: '短视频算法推荐是在满足需求还是制造需求', affirmative_view: '在满足，精准推荐提升效率', negative_view: '在制造，让人困在信息茧房' },
      '生物科学': { title: '基因编辑应该被允许用于人类胚胎增强吗', affirmative_view: '应该，是消除遗传疾病的进步', negative_view: '不应该，带来不可控伦理风险' }
    }
    const fallbackRows = missing.filter(c => fallbacks[c]).map(c => ({
      category: c,
      title: fallbacks[c].title,
      affirmative_view: fallbacks[c].affirmative_view,
      negative_view: fallbacks[c].negative_view,
      week_key: weekKey,
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
    return `${p.user_name}（风格：${skill?.desc ? skill.desc.slice(0, 80) : '知乎答主'}）`
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

  // Award scores to winners using upsert + increment
  if (debateData.winner === 'affirmative' || debateData.winner === 'negative') {
    const weekKey = topic.week_key
    const winners = participants.filter((p: any) => p.side === debateData.winner)
    for (const w of winners) {
      // Ensure row exists with base info
      await supabase.from('user_scores').upsert({
        user_id: w.user_id,
        user_name: w.user_name,
        user_avatar: w.user_avatar || null,
        week_key: weekKey,
        score: 0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,week_key', ignoreDuplicates: true })

      // Increment via RPC (or manual read-add-write fallback)
      const { error: rpcErr } = await supabase.rpc('increment_score', { p_user_id: w.user_id, p_week_key: weekKey })
      if (rpcErr) {
        // Fallback: read current + update
        const { data: cur } = await supabase
          .from('user_scores')
          .select('score')
          .eq('user_id', w.user_id)
          .eq('week_key', weekKey)
          .single()
        await supabase.from('user_scores').update({
          score: (cur?.score || 0) + 1,
          updated_at: new Date().toISOString()
        }).eq('user_id', w.user_id).eq('week_key', weekKey)
      }
    }
  }

  return debateData
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'DB 未配置' })

    const weekKey = getWeekKey()

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

      // List current week topics
      await ensureWeekTopics(supabase, weekKey)

      const { data: topics } = await supabase
        .from('arena_topics')
        .select('id, category, title, affirmative_view, negative_view, week_key, status, winner, ai_judgement')
        .eq('week_key', weekKey)
        .order('category')

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

      return json(res, 200, { topics: enriched, week_key: weekKey })
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
          // Start debate generation
          await supabase.from('arena_topics').update({ status: 'debating' }).eq('id', topic_id)
          try {
            await generateDebate(supabase, topic_id)
          } catch (e) {
            console.error('[arena] debate generation failed', e)
            await supabase.from('arena_topics').update({ status: 'open' }).eq('id', topic_id)
          }
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
