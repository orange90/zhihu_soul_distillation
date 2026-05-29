import { useRef } from 'react'
import { toPng } from 'html-to-image'

type SkillCardProps = {
  userName: string
  userAvatar?: string | null
  userId?: string
  rating: string
  ratingScore: number
  skillDesc: string
  onClose: () => void
}

const THEME: Record<string, {
  primary: string
  border: string
  bg: string
  text: string
  stroke: string
  label: string
}> = {
  '夯': {
    primary: '#D4A017',
    border: '#D4A017',
    bg: '#FFFBEB',
    text: '#92400E',
    stroke: '#D4A017',
    label: '夯'
  },
  '人上人': {
    primary: '#DC2626',
    border: '#DC2626',
    bg: '#FFF5F5',
    text: '#991B1B',
    stroke: '#DC2626',
    label: '人上人'
  },
  'NPC': {
    primary: '#16A34A',
    border: '#16A34A',
    bg: '#F0FDF4',
    text: '#166534',
    stroke: '#16A34A',
    label: 'NPC'
  },
  '拉完了': {
    primary: '#6B7280',
    border: '#9CA3AF',
    bg: '#F9FAFB',
    text: '#374151',
    stroke: '#6B7280',
    label: '拉完了'
  }
}

export default function SkillCard({
  userName,
  userAvatar,
  userId,
  rating,
  skillDesc,
  onClose
}: SkillCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const theme = THEME[rating] || THEME['NPC']

  const handleDownload = async () => {
    if (!cardRef.current) return
    try {
      const dataUrl = await toPng(cardRef.current, {
        cacheBust: true,
        pixelRatio: 2,
        style: { fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif' }
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `skill-card-${userName}.png`
      a.click()
    } catch (e) {
      console.error('card export failed', e)
    }
  }

  // Truncate description to ~100 chars for the card
  const cardDesc = skillDesc.length > 120
    ? skillDesc.slice(0, 117) + '…'
    : skillDesc

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        {/* Preview + actions */}
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">技能蒸馏卡片</h3>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ background: theme.primary }}
            >
              下载图片
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-1">×</button>
          </div>
        </div>

        {/* The actual card to be exported */}
        <div className="p-6">
          <div
            ref={cardRef}
            style={{
              border: `3px solid ${theme.border}`,
              background: theme.bg,
              borderRadius: '12px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'row',
              gap: '16px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif',
              minHeight: '200px',
              boxSizing: 'border-box'
            }}
          >
            {/* Left column */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              width: '100px',
              flexShrink: 0
            }}>
              {/* Avatar */}
              <div style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                border: `3px solid ${theme.border}`,
                overflow: 'hidden',
                background: '#e5e7eb',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}>
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userName}
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{ fontSize: '24px', color: theme.primary, fontWeight: 'bold' }}>
                    {userName.slice(0, 1)}
                  </span>
                )}
              </div>

              {/* User ID */}
              <div style={{
                border: `2px solid ${theme.border}`,
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                color: theme.text,
                fontWeight: '600',
                maxWidth: '90px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                textAlign: 'center',
                WebkitTextStroke: `0.3px ${theme.stroke}`
              }}>
                {userId || userName}
              </div>

              {/* Rating */}
              <div style={{
                fontSize: '11px',
                color: theme.text,
                textAlign: 'center',
                fontWeight: '500'
              }}>
                评级：
                <span style={{
                  fontWeight: '900',
                  WebkitTextStroke: `0.5px ${theme.stroke}`,
                  color: theme.primary
                }}>
                  {theme.label}
                </span>
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* QR code */}
              <div style={{
                width: '72px',
                height: '72px',
                border: `2px solid ${theme.border}`,
                borderRadius: '6px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff'
              }}>
                <img
                  src="/qrcode.png"
                  alt="QR"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => {
                    const el = e.currentTarget as HTMLImageElement
                    el.style.display = 'none'
                    const p = el.parentElement
                    if (p) {
                      p.innerHTML = `<div style="font-size:8px;color:${theme.text};text-align:center;padding:4px;">zhihusoul.cn</div>`
                    }
                  }}
                />
              </div>
            </div>

            {/* Right column */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              minWidth: 0
            }}>
              {/* Skill description area */}
              <div style={{
                flex: 1,
                border: `2px solid ${theme.border}`,
                borderRadius: '8px',
                padding: '12px',
                background: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <p style={{
                  fontSize: '13px',
                  color: theme.text,
                  lineHeight: '1.7',
                  margin: 0,
                  WebkitTextStroke: `0.2px ${theme.stroke}`
                }}>
                  {cardDesc}
                </p>
              </div>

              {/* Bottom tagline */}
              <div style={{
                fontSize: '13px',
                color: theme.primary,
                fontWeight: '700',
                textAlign: 'right',
                WebkitTextStroke: `0.4px ${theme.stroke}`
              }}>
                扫码加入，蒸馏你自己
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
