import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'
import type { AuthorSkills, Persona } from './_lib/types.js'

function fuse(skills: AuthorSkills[]): Persona {
  const styleWeights = new Map<string, number>()
  for (const s of skills) {
    const tags = (s.thinking_style || '').split(/[,\s\u3001\/]+/).filter(Boolean)
    const w = Math.max(1, Number(s.weight_score) || 1)
    for (const t of tags) {
      styleWeights.set(t, (styleWeights.get(t) || 0) + w)
    }
  }
  const sortedStyles = [...styleWeights.entries()].sort((a, b) => b[1] - a[1])
  const dominant = sortedStyles[0]?.[0] || skills[0]?.thinking_style || '理性分析型'

  const ranked = [...skills].sort(
    (a, b) => (Number(b.weight_score) || 0) - (Number(a.weight_score) || 0)
  )
  const collective_views = ranked.map((s) => `${s.signature_view}（${s.author_name}）`)

  const highlight_authors = ranked.map((s) => ({
    name: s.author_name,
    reason: `贡献了 ${s.thinking_style || '关键'} 视角的代表性观点`
  }))

  const headline = `这群人共享着「${dominant}」的内核，活跃于 ${
    [...new Set(skills.map((s) => s.domain).filter(Boolean))].slice(0, 3).join(' / ') || '多元领域'
  }。`

  return {
    headline,
    dominant_style: dominant,
    collective_views,
    highlight_authors,
    contributors: skills
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res)

    const body = await readBody<{ skills: AuthorSkills[] }>(req)
    const skills = (body.skills || []).filter(Boolean)
    if (skills.length === 0) return badRequest(res, 'no skills provided')
    if (skills.length > 5) return badRequest(res, 'at most 5 skills')

    const persona = fuse(skills)

    const supabase = getSupabase()
    if (supabase) {
      try {
        await supabase.from('user_circles').upsert(
          {
            user_id: session.user_id,
            author_ids: skills.map((s) => s.author_id),
            persona,
            created_at: new Date().toISOString()
          },
          { onConflict: 'user_id' }
        )
      } catch (e) {
        console.warn('user_circles upsert failed', e)
      }
    }

    return json(res, 200, { persona })
  } catch (err) {
    return serverError(res, err)
  }
}
