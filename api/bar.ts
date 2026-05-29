import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import { chatCompletion } from './_lib/zhihu.js'
import { barBotPersona, isBotUserId, makeBarBot } from './_lib/bots.js'

// Vercel：一次请求最多生成「一批」发言，控制在函数最大时长内即可。
export const maxDuration = 60

const MAX_TABLES = 4
const SEATS_PER_TABLE = 6
const MAX_TOTAL = MAX_TABLES * SEATS_PER_TABLE // 24
const COLD_START_MIN = 6 // 冷启动最少参与人数：8 点开聊前至少要凑够 6 人

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

function cstMinutes(): number {
  const now = new Date()
  return (now.getUTCHours() + 8) * 60 + now.getUTCMinutes()
}

// 晚上 7:50 起进入冷启动补位窗口（8 点正式开始发言）
function isBarPrefillTime(): boolean {
  return cstMinutes() >= 19 * 60 + 50
}

// 冷启动：晚上 7:50 后若真实吧友不足 6 人，自动补充「路过进来看看的」数字分身，
// 凑够 6 人，确保 8 点准时有人开聊。补位规则与真实用户一致（先坐满 1 号吧台）。
async function ensureBarColdStart(supabase: any, topic: any): Promise<void> {
  if (!topic || topic.status === 'completed') return
  if (!isBarPrefillTime()) return

  const { data: current } = await supabase
    .from('bar_sessions')
    .select('table_num, seat_num')
    .eq('topic_id', topic.id)

  const sessions = current || []
  if (sessions.length >= COLD_START_MIN) return

  const taken = new Set(sessions.map((s: any) => `${s.table_num}-${s.seat_num}`))
  const need = COLD_START_MIN - sessions.length

  const freeSeats: Array<{ table_num: number; seat_num: number }> = []
  outer: for (let t = 1; t <= MAX_TABLES; t++) {
    for (let s = 1; s <= SEATS_PER_TABLE; s++) {
      if (!taken.has(`${t}-${s}`)) {
        freeSeats.push({ table_num: t, seat_num: s })
        if (freeSeats.length >= need) break outer
      }
    }
  }

  for (const seat of freeSeats) {
    const bot = makeBarBot()
    // 并发补位可能撞唯一约束，忽略单条失败即可
    await supabase.from('bar_sessions').insert({
      topic_id: topic.id,
      user_id: bot.user_id,
      user_name: bot.user_name,
      user_avatar: bot.user_avatar,
      table_num: seat.table_num,
      seat_num: seat.seat_num,
    })
  }
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

// 全员发言完毕后，生成 AI 摘要并把讨论标记为已结束。
// 用「条件更新（status != completed）」抢占，确保并发下只结算一次。
async function finalizeBar(
  supabase: any,
  topic: any,
  spoken: Array<{ user_name: string; speech: string }>
): Promise<void> {
  let summary = ''
  try {
    const summaryPrompt = `以下是学术酒吧关于「${topic.topic}」的讨论发言：

${spoken.map((s, i) => `${i + 1}. ${s.user_name}：${s.speech}`).join('\n\n')}

请生成一段200字以内的AI摘要，总结这场讨论的主要观点、共识与分歧，语气轻松学术。`
    const summaryResult = await chatCompletion(
      [{ role: 'user', content: summaryPrompt }],
      { temperature: 0.6, timeoutMs: 40_000 }
    )
    summary = (summaryResult.content || '').trim().slice(0, 500)
  } catch (e) {
    console.error('[bar] summary failed', e)
  }
  await supabase.from('bar_topics')
    .update({ status: 'completed', ai_summary: summary || null })
    .eq('id', topic.id)
    .neq('status', 'completed')
}

// 生成「单个吧友的一段发言」。每次只生成一条，调用快、稳；只输出发言正文（不走 JSON 解析），
// 最大限度避免格式解析失败导致的「永远生成不出来」。
async function generateOneSpeech(
  topic: any,
  speaker: any,
  prior: Array<{ user_name: string; speech: string }>,
  skillMap: Record<string, { desc: string; markdown: string }>
): Promise<string> {
  const style = isBotUserId(speaker.user_id)
    ? barBotPersona()
    : (skillMap[speaker.user_id]?.desc ? skillMap[speaker.user_id].desc.slice(0, 60) : '知乎答主')
  const priorText = prior.length > 0
    ? `\n\n【已有的发言（请承接、避免重复）】\n${prior.map((s, i) => `${i + 1}. ${s.user_name}：${s.speech}`).join('\n')}`
    : ''

  const prompt = `今天学术酒吧的议题是：「${topic.topic}」

现在轮到【${speaker.user_name}】发言：
- 风格：${style}
- 要求：基于其风格、紧扣议题、言之有物，可承接前面发言继续深化或提出不同看法
- 语气：像在酒吧聊天，轻松但有深度，可用第一人称
- 字数：100-300字${priorText}

请直接以 ${speaker.user_name} 的口吻输出这段发言正文。不要加「${speaker.user_name}：」之类前缀，不要引号，不要任何解释。`

  const result = await chatCompletion(
    [
      { role: 'system', content: '你是学术酒吧里的发言者，只输出该参与者这一段的发言正文，自然口语、有个人风格。' },
      { role: 'user', content: prompt }
    ],
    { temperature: 0.85, timeoutMs: 25_000, maxRetries: 1 }
  )

  let content = (result.content || '').trim()
  content = content.replace(/^["「『]+/, '').replace(/["」』]+$/, '').trim()
  for (const pre of [`${speaker.user_name}：`, `${speaker.user_name}:`]) {
    if (content.startsWith(pre)) content = content.slice(pre.length).trim()
  }
  return content
}

// 推进学术酒吧讨论「一步」：为下一位已就坐但未发言的吧友生成一段发言并落库；
// 全员发言完毕后生成 AI 摘要并结束。可重复调用、可断点续传（以是否已有 speech 为进度依据），
// 每次只做一条，保证在函数最大时长内完成。返回该讨论是否已结束。
async function advanceBar(supabase: any, topicId: string): Promise<{ done: boolean }> {
  const { data: topic } = await supabase.from('bar_topics').select('*').eq('id', topicId).single()
  if (!topic || topic.status === 'completed') return { done: true }

  const { data: allSessions } = await supabase
    .from('bar_sessions')
    .select('user_id, user_name, user_avatar, table_num, seat_num, speech')
    .eq('topic_id', topicId)
    .order('table_num').order('seat_num')

  const sessions = allSessions || []
  if (sessions.length === 0) return { done: false }

  const pending = sessions.filter((s: any) => !s.speech)

  // 全员发言完毕 → 生成摘要并结束
  if (pending.length === 0) {
    if (!topic.ai_summary) {
      const spoken = sessions
        .filter((s: any) => s.speech)
        .map((s: any) => ({ user_name: s.user_name, speech: s.speech }))
      await finalizeBar(supabase, topic, spoken)
    } else {
      await supabase.from('bar_topics')
        .update({ status: 'completed' })
        .eq('id', topicId)
        .neq('status', 'completed')
    }
    return { done: true }
  }

  const speaker = pending[0]
  const prior = sessions
    .filter((s: any) => s.speech)
    .map((s: any) => ({ user_name: s.user_name, speech: s.speech }))

  const { data: skills } = await supabase
    .from('user_distillation_results')
    .select('user_id, skill_desc, skill_markdown')
    .in('user_id', [speaker.user_id])
  const skillMap: Record<string, { desc: string; markdown: string }> = {}
  for (const s of (skills || [])) {
    skillMap[s.user_id] = { desc: s.skill_desc || '', markdown: s.skill_markdown || '' }
  }

  const content = await generateOneSpeech(topic, speaker, prior, skillMap)
  if (!content) throw new Error(`empty bar speech for ${speaker.user_id}`)

  // 仅在该座位仍未发言时写入，保证并发幂等（不覆盖已生成的发言）
  await supabase.from('bar_sessions')
    .update({ speech: content, generated_at: new Date().toISOString() })
    .eq('topic_id', topicId)
    .eq('user_id', speaker.user_id)
    .is('speech', null)

  return { done: false }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'DB 未配置' })

    if (req.method === 'GET') {
      // Return list of all past bar topics
      if (req.query.history === '1') {
        const { data } = await supabase
          .from('bar_topics')
          .select('id, topic, date_key, status, ai_summary')
          .order('date_key', { ascending: false })
          .limit(30)
        return json(res, 200, { topics: data || [] })
      }

      // Return a specific date's full session data
      const dateParam = req.query.date
      if (typeof dateParam === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        const { data: topicData } = await supabase
          .from('bar_topics')
          .select('*')
          .eq('date_key', dateParam)
          .maybeSingle()
        if (!topicData) return json(res, 404, { error: '该日期暂无记录' })
        const { data: sessions } = await supabase
          .from('bar_sessions')
          .select('user_id, user_name, user_avatar, table_num, seat_num, speech, generated_at')
          .eq('topic_id', topicData.id)
          .order('table_num').order('seat_num')
        return json(res, 200, {
          topic: topicData,
          sessions: sessions || [],
          total_seats: MAX_TOTAL,
          is_active: false,
          is_published: true
        })
      }

      const topic = await ensureTodayTopic(supabase)

      if (!topic) {
        return json(res, 200, { topic: null, sessions: [], message: '今日议题将于上午 10 点发布' })
      }

      // 冷启动：7:50 后人数不足则补充路人分身，凑够 6 人
      await ensureBarColdStart(supabase, topic)

      const { data: sessions } = await supabase
        .from('bar_sessions')
        .select('user_id, user_name, user_avatar, table_num, seat_num, speech, generated_at')
        .eq('topic_id', topic.id)
        .order('table_num').order('seat_num')

      let finalTopic = topic
      let finalSessions = sessions || []

      // 8 点后讨论进行中：每次拉取时推进一批发言生成（前端轮询驱动，断点续传）。
      // 不能在响应返回后 fire-and-forget——serverless 会冻结函数，后台任务跑不完。
      if (isBarActive() && topic.status !== 'completed' && finalSessions.length > 0) {
        if (topic.status !== 'active') {
          await supabase.from('bar_topics')
            .update({ status: 'active' })
            .eq('id', topic.id)
            .neq('status', 'completed')
        }
        await advanceBar(supabase, topic.id).catch(e => console.error('[bar] advance failed', e))

        // 重新拉取最新状态返回
        const [{ data: t2 }, { data: s2 }] = await Promise.all([
          supabase.from('bar_topics').select('*').eq('id', topic.id).single(),
          supabase.from('bar_sessions')
            .select('user_id, user_name, user_avatar, table_num, seat_num, speech, generated_at')
            .eq('topic_id', topic.id)
            .order('table_num').order('seat_num')
        ])
        if (t2) finalTopic = t2
        if (s2) finalSessions = s2
      }

      return json(res, 200, {
        topic: finalTopic,
        sessions: finalSessions,
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
