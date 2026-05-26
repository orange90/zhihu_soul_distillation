interface WatermarkProps {
  text?: string
  /** 单块瓦片宽度，像素 */
  tileWidth?: number
  /** 单块瓦片高度，像素 */
  tileHeight?: number
  /** 文字大小，像素 */
  fontSize?: number
  /** 文字颜色（带透明度） */
  color?: string
  /** 旋转角度 */
  rotate?: number
  className?: string
}

/**
 * 平铺倾斜的 AI 生成背景水印。父容器需 relative + overflow-hidden。
 * 默认水印放在最底层，兄弟节点请用 relative 包裹以叠在水印之上。
 */
export default function Watermark({
  text = 'AI 生成 · 非答主本人立场',
  tileWidth = 320,
  tileHeight = 140,
  fontSize = 18,
  color = 'rgba(124,58,237,0.16)',
  rotate = -22,
  className = ''
}: WatermarkProps) {
  const cx = tileWidth / 2
  const cy = tileHeight / 2
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${tileWidth}' height='${tileHeight}'>` +
    `<text x='${cx}' y='${cy}' fill='${color}' font-size='${fontSize}' font-weight='700' ` +
    `font-family='-apple-system,BlinkMacSystemFont,Segoe UI,PingFang SC,Hiragino Sans GB,Microsoft YaHei,sans-serif' ` +
    `text-anchor='middle' dominant-baseline='middle' ` +
    `transform='rotate(${rotate} ${cx} ${cy})'>${text}</text>` +
    `</svg>`
  const url = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 select-none ${className}`}
      style={{
        backgroundImage: `url("${url}")`,
        backgroundRepeat: 'repeat'
      }}
    />
  )
}
