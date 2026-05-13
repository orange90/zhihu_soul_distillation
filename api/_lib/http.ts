import type { VercelRequest, VercelResponse } from '@vercel/node'

export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status).setHeader('Content-Type', 'application/json; charset=utf-8')
  res.send(JSON.stringify(body))
}

export function badRequest(res: VercelResponse, msg: string) {
  return json(res, 400, { error: msg })
}

export function unauthorized(res: VercelResponse, msg = 'unauthorized') {
  return json(res, 401, { error: msg })
}

export function serverError(res: VercelResponse, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  console.error('[api error]', err)
  return json(res, 500, { error: msg })
}

export async function readBody<T = any>(req: VercelRequest): Promise<T> {
  if (req.body && typeof req.body === 'object') return req.body as T
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as T
    } catch {
      return {} as T
    }
  }
  return {} as T
}
