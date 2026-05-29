import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import { chatCompletion, extractFirstJson } from './_lib/zhihu.js'

const MAX_DAILY = 2
const MAX_ANSWERS = 10

function buildProbePrompt(name: string, excerpts: string): string {
  return `以下是知乎用户「${name}」的回答摘要：

${excerpts || '（暂无可用摘要）'}

请用 JSON 格式输出对这位用户的思维画像，不要解释，只输出 JSON：
{
  "values": "核心价值观，15字以内",
  "thinking_style": "思维方式标签，从以下选1-2个：[理性分析型, 批判反思型, 人文关怀型, 实用主义型, 哲学思辨型, 技术深潜型, 跨界整合型, 系统结构型, 数据驱动型, 经验归纳型, 直觉洞察型, 叙事共情型, 逆向思维型, 辩证综合型, 演绎推理型, 创意发散型]",
  "domain": "最擅长领域，10字以内",
  "signature_view": "最具代表性的一个观点，20字以内"
}`
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res, '请先登录')

    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'DB 未配置' })

    const today = new Date().toISOString().slice(0, 10)

    // Check daily limit
    const { count: dailyCount } = await supabase
      .from('daily_distillation_log')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user_id)
      .eq('date_key', today)

    if ((dailyCount || 0) >= MAX_DAILY) {
      return json(res, 429, { error: `今日蒸馏次数已达上限（${MAX_DAILY} 次），明天再来` })
    }

    // Get user's uploaded answers
    const { data: answers } = await supabase
      .from('user_uploaded_answers')
      .select('answer_id, title, content, excerpt, voteup_count, url')
      .eq('uploader_id', session.user_id)
      .order('voteup_count', { ascending: false })
      .limit(MAX_ANSWERS)

    if (!answers || answers.length === 0) {
      return json(res, 400, { error: '你还没有上传回答，请先通过浏览器插件上传你的知乎回答' })
    }

    const name = session.user_name

    // Step 1: Extract profile via AI probe
    const excerpts = answers
      .slice(0, 6)
      .map((a, i) => `${i + 1}. ${a.title}：${(a.excerpt || a.content || '').slice(0, 600)}（点赞：${a.voteup_count}）`)
      .join('\n')

    const probeResult = await chatCompletion(
      [
        { role: 'system', content: '你是一个擅长分析知乎答主写作风格的助手，只输出纯 JSON，不要任何解释。' },
        { role: 'user', content: buildProbePrompt(name, excerpts) }
      ],
      { temperature: 0.3, timeoutMs: 30_000 }
    )

    const profile = extractFirstJson<{
      values: string; thinking_style: string; domain: string; signature_view: string
    }>(probeResult.content) || {
      values: '真诚分享', thinking_style: '理性分析型', domain: '知乎', signature_view: '独立思考'
    }

    // Step 2: Generate skill markdown
    const corpus = answers
      .map((a, i) => `【作品 ${i + 1}｜赞${a.voteup_count}】\n标题：${a.title}\n正文：${(a.content || a.excerpt || '').slice(0, 1500)}`)
      .join('\n\n')

    const skillPrompt = `你现在要为知乎答主「${name}」生成一份个人写作风格 Skill 文档（Markdown 格式）。

# 目标答主
- 姓名/ID：${name}
- 基础画像：价值观=${profile.values}；思维方式=${profile.thinking_style}；擅长领域=${profile.domain}；代表观点=${profile.signature_view}

# 目标答主的代表作品语料（按点赞数降序）：
${corpus || '（无可用素材）'}

# 生成要求
请生成一份完整的 Skill 文档，Markdown 格式：
1. YAML frontmatter（name、description 字段，description 说明适用场景）
2. ## 关于这个 Skill（简介，3-4句）
3. ## 核心价值观（从真实素材提炼 3-5 条，每条一句话加解读）
4. ## 写作风格与特色（语气、结构偏好、常用句式）
5. ## 专属口语词组库（实际出现的高频表达，至少3条）

要求：
- 严格基于素材提炼，不编造
- 整篇 800-1500 字
- 只输出 Markdown，从 --- 开头，不要任何前言或解释`

    const skillResult = await chatCompletion(
      [
        { role: 'system', content: '你是一个擅长提炼个人写作风格的助手，基于素材忠实提炼，输出完整 Markdown Skill 文档。' },
        { role: 'user', content: skillPrompt }
      ],
      { temperature: 0.7, timeoutMs: 120_000 }
    )

    let skillMarkdown = (skillResult.content || '').trim()
      .replace(/^```(?:markdown|md)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()

    // Step 3: Generate skill desc
    const descResult = await chatCompletion(
      [{ role: 'user', content: `基于以下知乎答主的风格画像，用 180-220 个汉字生成一段精炼的"人格名片"描述，要生动有个性，突出最核心的特质：\n价值观：${profile.values}\n思维方式：${profile.thinking_style}\n擅长领域：${profile.domain}\n代表观点：${profile.signature_view}\n只输出描述文字本身。` }],
      { temperature: 0.7 }
    )
    const skillDesc = (descResult.content || '').trim().slice(0, 240)

    // Step 4: Rate the distillation quality
    const ratingPrompt = `评估以下知乎答主蒸馏结果的质量，输出评分JSON。

答主：${name}，素材数量：${answers.length} 条，最高点赞：${Math.max(...answers.map(a => a.voteup_count || 0))}
Skill文档摘要：${skillMarkdown.slice(0, 300)}

评分标准（偏向给高分，除非数据真的很少）：
- 夯（85-100）：个性鲜明，观点独到，素材丰富有深度
- 人上人（65-84）：有一定个性，观点较清晰，能看出风格
- NPC（40-64）：素材不足或过于泛泛，个性模糊
- 拉完了（0-39）：数据极少，几乎无法提炼任何风格

注意：素材≥5条且内容有深度，至少给70分（人上人）

只输出JSON：{"score": 85, "rating": "夯", "reason": "..."}`

    const ratingResult = await chatCompletion(
      [{ role: 'user', content: ratingPrompt }],
      { temperature: 0.2 }
    )
    const ratingData = extractFirstJson<{ score: number; rating: string; reason: string }>(ratingResult.content) || {
      score: 70, rating: '人上人', reason: '蒸馏完成'
    }

    // Get current distill_count
    const { data: existing } = await supabase
      .from('user_distillation_results')
      .select('distill_count')
      .eq('user_id', session.user_id)
      .maybeSingle()
    const newCount = (existing?.distill_count || 0) + 1

    const now = new Date().toISOString()
    await supabase.from('user_distillation_results').upsert({
      user_id: session.user_id,
      user_name: session.user_name,
      user_avatar: session.avatar_url || null,
      skill_markdown: skillMarkdown,
      skill_desc: skillDesc,
      rating: ratingData.rating,
      rating_score: ratingData.score,
      answer_count: answers.length,
      distill_count: newCount,
      last_distilled_at: now,
      updated_at: now
    }, { onConflict: 'user_id' })

    await supabase.from('daily_distillation_log').insert({
      user_id: session.user_id,
      date_key: today
    }).select()

    return json(res, 200, {
      skill_markdown: skillMarkdown,
      skill_desc: skillDesc,
      rating: ratingData.rating,
      rating_score: ratingData.score,
      rating_reason: ratingData.reason,
      answer_count: answers.length,
      distill_count: newCount
    })
  } catch (err) {
    return serverError(res, err)
  }
}
