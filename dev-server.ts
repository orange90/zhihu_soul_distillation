import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
dotenv.config()

async function main() {
  const express = (await import('express')).default

  const authLogin = (await import('./api/auth/login.js')).default
  const authCallback = (await import('./api/auth/callback.js')).default
  const authMe = (await import('./api/auth/me.js')).default
  const authLogout = (await import('./api/auth/logout.js')).default
  const following = (await import('./api/following.js')).default
  const distill = (await import('./api/distill.js')).default
  const persona = (await import('./api/persona.js')).default
  const chat = (await import('./api/chat.js')).default

  const PORT = 3001
  const app = express()
  app.use(express.json())

  app.all('/api/auth/login', authLogin as any)
  app.all('/api/auth/callback', authCallback as any)
  app.all('/api/auth/me', authMe as any)
  app.all('/api/auth/logout', authLogout as any)
  app.all('/api/following', following as any)
  app.all('/api/distill', distill as any)
  app.all('/api/persona', persona as any)
  app.all('/api/chat', chat as any)

  app.listen(PORT, () => {
    console.log(`API dev server running at http://localhost:${PORT}`)
    console.log(`  ZHIHU_APP_ID: ${process.env.ZHIHU_APP_ID}`)
    console.log(`  LLM_BASE_URL: ${process.env.LLM_BASE_URL}`)
    console.log(`  REDIRECT_URI: ${process.env.ZHIHU_REDIRECT_URI}`)
  })
}

main().catch(console.error)
