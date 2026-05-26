import type { VercelRequest, VercelResponse } from '@vercel/node'
import { badRequest, json, readBody, serverError, unauthorized } from './_lib/http.js'
import { readSession } from './_lib/session.js'
import { getSupabase } from './_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') return badRequest(res, 'method not allowed')
    const session = readSession(req)
    if (!session) return unauthorized(res)

    const supabase = getSupabase()
    if (!supabase) return json(res, 503, { error: 'database unavailable' })

    const body = await readBody<{ action?: string }>(req)
    const action = body.action
    if (action !== 'add' && action !== 'remove') {
      return badRequest(res, 'action must be "add" or "remove"')
    }

    if (action === 'add') {
      const { error: upsertError } = await supabase
        .from('opted_out_authors')
        .upsert(
          { author_id: session.user_id, author_name: session.user_name },
          { onConflict: 'author_id' }
        )
      if (upsertError) {
        console.error('[optout] upsert failed', upsertError)
        return json(res, 500, {
          error: `保存禁止状态失败：${upsertError.message}。请确认 supabase/schema.sql 中的 opted_out_authors 表已在数据库中创建。`
        })
      }
      // Verify the row was actually written before claiming success
      const { data: verify, error: verifyError } = await supabase
        .from('opted_out_authors')
        .select('author_id')
        .eq('author_id', session.user_id)
        .maybeSingle()
      if (verifyError || !verify) {
        console.error('[optout] verify failed', verifyError)
        return json(res, 500, {
          error: '禁止状态写入未生效，请稍后重试或联系管理员检查数据库。'
        })
      }
      // Only after we've confirmed the block is persisted do we drop the cached distillation
      const { error: deleteError } = await supabase
        .from('author_skills')
        .delete()
        .eq('author_id', session.user_id)
      if (deleteError) {
        console.warn('[optout] author_skills cleanup failed', deleteError)
      }
    } else {
      const { error: deleteError } = await supabase
        .from('opted_out_authors')
        .delete()
        .eq('author_id', session.user_id)
      if (deleteError) {
        console.error('[optout] delete failed', deleteError)
        return json(res, 500, { error: `取消禁止失败：${deleteError.message}` })
      }
    }

    return json(res, 200, { opted_out: action === 'add' })
  } catch (err) {
    return serverError(res, err)
  }
}
