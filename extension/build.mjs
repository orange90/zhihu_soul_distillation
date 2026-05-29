import * as esbuild from 'esbuild'
import { mkdir, copyFile, cp, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const watch = process.argv.includes('--watch')
const outdir = 'dist'

await mkdir(outdir, { recursive: true })

const common = {
  bundle: true,
  format: 'esm',
  target: ['chrome120'],
  sourcemap: watch ? 'inline' : false,
  legalComments: 'none',
  logLevel: 'info'
}

const entries = [
  { entry: 'src/background.ts', out: `${outdir}/background.js` },
  { entry: 'src/content.ts', out: `${outdir}/content.js` },
  { entry: 'src/web-bridge.ts', out: `${outdir}/web-bridge.js` },
  { entry: 'src/popup.ts', out: `${outdir}/popup.js` }
]

async function buildAll() {
  await Promise.all(
    entries.map((e) =>
      esbuild.build({
        ...common,
        entryPoints: [e.entry],
        outfile: e.out
      })
    )
  )
  // 拷贝静态文件
  await copyFile('manifest.json', `${outdir}/manifest.json`)
  await copyFile('src/popup.html', `${outdir}/popup.html`)
  await copyFile('src/popup.css', `${outdir}/popup.css`)
  await copyFile('src/content.css', `${outdir}/content.css`)
  // 图标占位（如不存在就生成空白 PNG，否则拷贝）
  if (existsSync('icons')) {
    await cp('icons', `${outdir}/icons`, { recursive: true })
  }
  // 兜底：若 icons 目录里没图标，写三个 1x1 透明 PNG 占位
  const iconNames = ['icon16.png', 'icon48.png', 'icon128.png']
  await mkdir(path.join(outdir, 'icons'), { recursive: true })
  const tinyPng = Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c63000100000005000100377e2d8a0000000049454e44ae426082',
    'hex'
  )
  for (const n of iconNames) {
    const dst = path.join(outdir, 'icons', n)
    if (!existsSync(dst)) await writeFile(dst, tinyPng)
  }
}

if (watch) {
  // 简单的 watch：分别启动 esbuild context
  const ctxs = await Promise.all(
    entries.map((e) => esbuild.context({ ...common, entryPoints: [e.entry], outfile: e.out }))
  )
  await Promise.all(ctxs.map((c) => c.watch()))
  await buildAll()
  console.log('[zsd-extension] watch mode running…')
} else {
  await buildAll()
  console.log('[zsd-extension] build done →', outdir)
}
