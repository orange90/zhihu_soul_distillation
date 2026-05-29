import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import { chatCompletion, extractFirstJson } from './_lib/zhihu.js'

const MAX_TABLES = 5
const SEATS_PER_TABLE = 6
const MAX_TOTAL = MAX_TABLES * SEATS_PER_TABLE // 30

const FALLBACK_TOPICS = [
  'AI 大模型是否正在取代人类的创造力？',
  '脑机接口技术的普及，是人类进化还是异化？',
  '量子计算突破之后，密码学将何去何从？',
  '元宇宙的消亡与重生：下一个数字世界会是什么样子？',
  '自动驾驶的伦理困境：算法应该为谁的生命优先？',
  '数字人类：当AI能完美模拟一个人，我们还剩什么？',
  '开源 AI 是人类之福还是潘多拉魔盒？'
]

async function fetchZhihuHotTopics(hours = 24): Promise<string[]> {
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

async function pickAcademicTopic(hotTopics: string[], dateKey: string): Promise<string> {
  if (hotTopics.length === 0) {
    return FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)]
  }
  const prompt = `今天是 ${dateKey}，以下是知乎今日热榜话题：\n${hotTopics.slice(0, 15).map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n请从中选择一个最具学术探讨价值的话题，或基于其中一个话题改写成更适合学术讨论的议题（30字以内）。学术酒吧的议题应该能引发多角度的知识性讨论，而不仅仅是情绪宣泄。\n\n只输出议题文本，不要任何前缀或解释。`
  try {
    const result = await chatCompletion([{ role: 'user', content: prompt }], { temperature: 0.7 })
    return (result.content || '').trim().replace(/^["「【]|["」】]$/g, '').slice(0, 80) ||
      FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)]
  } catch {
    return FALLBACK_TOPICS[Math.floor(Math.random() * FALLBACK_TOPICS.length)]
  }
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function isBarActive(): boolean {
  const now = new Date()
  const hour = now.getUTCHours() + 8 // CST = UTC+8
  return hour >= 20 // 8pm CST
}

function isTopicPublished(): boolean {
  const now = new Date()
  const hour = now.getUTCHours() + 8 // CST
  return hour >= 10 // 10am CST
}

async function ensureTodayTopic(supabase: any): Promise<any> {
  const dateKey = getTodayKey()

  const { data: existing } = await supabase
    .from('bar_topics')
    .select('*')
    .eq('date_key', dateKey)
    .maybeSingle()

  if (existing) return existing

  if (!isTopicPublished()) {
    return null
  }

  // Fetch hot topics and pick the most academic one
  const hotTopics = await fetchZhihuHotTopics(24)
  const topic = await pickAcademicTopic(hotTopics, dateKey)

  const status = isBarActive() ? 'active' : 'open'
  const { data: created } = await supabase
    .from('bar_topics')
    .insert({ topic, date_key: dateKey, status })
    .select()
    .single()

  return created
}

async function generateSpeeches(supabase: any, topicId: string) {
  const { data: topic } = await supabase.from('bar_topics').select('*').eq('id', topicId).single()
  if (!topic) throw new Error('Topic not found')

  const { data: sessions } = await supabase
    .from('bar_sessions')
    .select('user_id, user_name, user_avatar, table_num, seat_num')
    .eq('topic_id', topicId)
    .is('speech', null)
    .order('table_num').order('seat_num')

  if (!sessions || sessions.length === 0) return

  // Get all skills
  const userIds = sessions.map((s: any) => s.user_id)
  const { data: skills } = await supabase
    .from('user_distillation_results')
    .select('user_id, skill_desc, skill_markdown')
    .in('user_id', userIds)

  const skillMap: Record<string, { desc: string; markdown: string }> = {}
  for (const s of (skills || [])) {
    skillMap[s.user_id] = { desc: s.skill_desc || '', markdown: s.skill_markdown || '' }
  }

  const participantList = sessions.map((s: any, i: number) => {
    const skill = skillMap[s.user_id]
    return `${i + 1}. ${s.user_name}（风格：${skill?.desc ? skill.desc.slice(0, 60) : '知乎答主'}）`
  }).join('\n')

  const prompt = `今天学术酒吧的议题是：「${topic.topic}」

参与者（按发言顺序）：
${participantList}

请为每位参与者生成一段发言（100-300字），要求：
1. 基于该参与者的个人风格特点
2. 紧扣议题，言之有物
3. 后面的人可以借鉴前人观点继续深化，也可以提出不同看法
4. 语气要像在酒吧聊天——轻松但有深度，可以用第一人称

注意：所有发言加起来要形成一个有层次的讨论，从多个角度探讨议题。

只输出JSON数组：
[
  {"user_id": "用户ID", "speech": "发言内容"},
  ...
]`

  const result = await chatCompletion(
    [
      { role: 'system', content: '你是一个学术酒吧的主持人AI，负责模拟每位参与者的发言风格，生成一场有深度有趣味的学术讨论。' },
      { role: 'user', content: prompt }
    ],
    { temperature: 0.8, timeoutMs: 180_000, maxRetries: 1 }
  )

  const speeches = extractFirstJson<Array<{ user_id: string; speech: string }>>(result.content) || []

  // Update speeches in DB
  const now = new Date().toISOString()
  for (const speech of speeches) {
    await supabase.from('bar_sessions').update({
      speech: speech.speech,
      generated_at: now
    }).eq('topic_id', topicId).eq('user_id', speech.user_id)
  }

  // Generate AI summary
  const summaryPrompt = `以下是学术酒吧关于「${topic.topic}」的讨论发言：

${speeches.map((s, i) => `${i + 1}. ${s.speech}`).join('\n\n')}

请生成一段200字以内的AI摘要，总结这场讨论的主要观点、共识与分歧，语气轻松学术。`

  try {
    const summaryResult = await chatCompletion([{ role: 'user', content: summaryPrompt }], { temperature: 0.6 })
    await supabase.from('bar_topics').update({
      status: 'completed',
      ai_summary: (summaryResult.content || '').trim().slice(0, 500)
    }).eq('id', topicId)
  } catch {
    await supabase.from('bar_topics').update({ status: 'completed' }).eq('id', topicId)
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'DB 未配置' })

    if (req.method === 'GET') {
      const topic = await ensureTodayTopic(supabase)

      if (!topic) {
        return json(res, 200, { topic: null, sessions: [], message: '今日议题将于上午 10 点发布' })
      }

      const { data: sessions } = await supabase
        .from('bar_sessions')
        .select('user_id, user_name, user_avatar, table_num, seat_num, speech, generated_at')
        .eq('topic_id', topic.id)
        .order('table_num').order('seat_num')

      // If bar is active (past 8pm) and speeches not generated yet, trigger generation
      const allSessions = sessions || []
      const needsGeneration = isBarActive() &&
        topic.status !== 'completed' &&
        allSessions.length > 0 &&
        allSessions.every((s: any) => !s.speech)

      if (needsGeneration) {
        await supabase.from('bar_topics').update({ status: 'active' }).eq('id', topic.id)
        generateSpeeches(supabase, topic.id).catch(e => console.error('[bar] speech generation failed', e))
      }

      return json(res, 200, {
        topic,
        sessions: allSessions,
        total_seats: MAX_TOTAL,
        is_active: isBarActive(),
        is_published: isTopicPublished()
      })
    }

    if (req.method === 'POST') {
      const session = readSession(req)
      if (!session) return unauthorized(res, '请先登录')

      const body = await readBody<{ action: string }>(req)

      if (body.action === 'join') {
        // Check user has digital twin
        const { data: twin } = await supabase
          .from('user_distillation_results')
          .select('user_id')
          .eq('user_id', session.user_id)
          .maybeSingle()

        if (!twin) {
          return json(res, 403, { error: '你还没有数字分身，请先在「我的蒸馏」页面完成蒸馏' })
        }

        const topic = await ensureTodayTopic(supabase)
        if (!topic) return json(res, 400, { error: '今日议题尚未发布（上午10点发布）' })
        if (topic.status === 'completed') return json(res, 409, { error: '今日讨论已结束' })

        // Check not already joined
        const { data: existing } = await supabase
          .from('bar_sessions')
          .select('id')
          .eq('topic_id', topic.id)
          .eq('user_id', session.user_id)
          .maybeSingle()
        if (existing) return json(res, 409, { error: '你已加入今日学术酒吧' })

        // Find next seat (fill table 1 first, then table 2, etc.)
        const { data: currentSessions } = await supabase
          .from('bar_sessions')
          .select('table_num, seat_num')
          .eq('topic_id', topic.id)

        const taken = new Set((currentSessions || []).map((s: any) => `${s.table_num}-${s.seat_num}`))
        if (taken.size >= MAX_TOTAL) return json(res, 409, { error: '今日学术酒吧已满员（30人）' })

        let tableNum = 1
        let seatNum = 1
        outer: for (let t = 1; t <= MAX_TABLES; t++) {
          for (let s = 1; s <= SEATS_PER_TABLE; s++) {
            if (!taken.has(`${t}-${s}`)) {
              tableNum = t
              seatNum = s
              break outer
            }
          }
        }

        const { error: joinErr } = await supabase.from('bar_sessions').insert({
          topic_id: topic.id,
          user_id: session.user_id,
          user_name: session.user_name,
          user_avatar: session.avatar_url || null,
          table_num: tableNum,
          seat_num: seatNum
        })
        if (joinErr) return serverError(res, new Error(joinErr.message))

        return json(res, 200, { joined: true, table_num: tableNum, seat_num: seatNum })
      }

      return badRequest(res, 'unknown action')
    }

    return badRequest(res, 'method not allowed')
  } catch (err) {
    return serverError(res, err)
  }
}
