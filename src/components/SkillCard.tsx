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
  bgFrom: string
  bgTo: string
  text: string
  accent: string
  ratingColor: string
  badgeBg: string
  badgeText: string
  cornerTint: string
}> = {
  '夯': {
    primary: '#B8860B',
    border: '#D4A017',
    bgFrom: '#FFFEF5',
    bgTo: '#FFF8DC',
    text: '#7B5010',
    accent: '#D4A017',
    ratingColor: '#B8860B',
    badgeBg: 'linear-gradient(135deg, #D4A017 0%, #B8860B 100%)',
    badgeText: '#fff',
    cornerTint: 'rgba(212,160,23,0.12)',
  },
  '人上人': {
    primary: '#C0392B',
    border: '#E74C3C',
    bgFrom: '#FFFAFA',
    bgTo: '#FFF0EE',
    text: '#922B21',
    accent: '#E74C3C',
    ratingColor: '#C0392B',
    badgeBg: 'linear-gradient(135deg, #E74C3C 0%, #C0392B 100%)',
    badgeText: '#fff',
    cornerTint: 'rgba(231,76,60,0.10)',
  },
  'NPC': {
    primary: '#1A7A4A',
    border: '#27AE60',
    bgFrom: '#F8FFFC',
    bgTo: '#F0FFF6',
    text: '#145A32',
    accent: '#27AE60',
    ratingColor: '#1A7A4A',
    badgeBg: 'linear-gradient(135deg, #27AE60 0%, #1A7A4A 100%)',
    badgeText: '#fff',
    cornerTint: 'rgba(39,174,96,0.10)',
  },
  '拉完了': {
    primary: '#555',
    border: '#9CA3AF',
    bgFrom: '#FAFAFA',
    bgTo: '#F3F4F6',
    text: '#374151',
    accent: '#6B7280',
    ratingColor: '#555',
    badgeBg: 'linear-gradient(135deg, #9CA3AF 0%, #6B7280 100%)',
    badgeText: '#fff',
    cornerTint: 'rgba(107,114,128,0.08)',
  },
}

export default function SkillCard({
  userName,
  userAvatar,
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
        style: {
          fontFamily: '"Ma Shan Zheng", "Noto Serif SC", "PingFang SC", "Microsoft YaHei", serif',
        }
      })
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `skill-card-${userName}.png`
      a.click()
    } catch (e) {
      console.error('card export failed', e)
    }
  }

  const cardDesc = skillDesc.length > 130 ? skillDesc.slice(0, 127) + '…' : skillDesc

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5 border-b flex items-center justify-between">
          <h3 className="font-semibold text-gray-800">技能蒸馏卡片</h3>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-white"
              style={{ background: theme.badgeBg }}
            >
              下载图片
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl px-1">×</button>
          </div>
        </div>

        <div className="p-6">
          {/* The actual card rendered for export */}
          <div
            ref={cardRef}
            style={{
              background: `linear-gradient(145deg, ${theme.bgFrom} 0%, ${theme.bgTo} 100%)`,
              border: `2.5px solid ${theme.border}`,
              borderRadius: '14px',
              padding: '18px',
              display: 'flex',
              flexDirection: 'row',
              gap: '14px',
              fontFamily: '"Ma Shan Zheng", "Noto Serif SC", "PingFang SC", serif',
              minHeight: '200px',
              boxSizing: 'border-box',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Decorative corner accents */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
              background: `
                radial-gradient(ellipse 60% 50% at 0% 0%, ${theme.cornerTint} 0%, transparent 60%),
                radial-gradient(ellipse 50% 40% at 100% 100%, ${theme.cornerTint} 0%, transparent 60%)
              `,
              pointerEvents: 'none',
            }} />

            {/* Left column */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              width: '88px',
              flexShrink: 0,
              position: 'relative',
            }}>
              {/* Avatar ring */}
              <div style={{
                width: '68px',
                height: '68px',
                borderRadius: '50%',
                border: `2.5px solid ${theme.border}`,
                overflow: 'hidden',
                background: `linear-gradient(135deg, ${theme.bgFrom}, ${theme.bgTo})`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                boxShadow: `0 2px 8px ${theme.cornerTint}`,
              }}>
                {userAvatar ? (
                  <img
                    src={userAvatar}
                    alt={userName}
                    crossOrigin="anonymous"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <span style={{
                    fontSize: '26px',
                    color: theme.primary,
                    fontWeight: 'bold',
                    fontFamily: '"Noto Serif SC", serif',
                  }}>
                    {userName.slice(0, 1)}
                  </span>
                )}
              </div>

              {/* Username - no box, just styled text */}
              <div style={{
                fontSize: '12px',
                color: theme.text,
                fontWeight: '600',
                textAlign: 'center',
                maxWidth: '84px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: '"Noto Serif SC", serif',
                letterSpacing: '0.5px',
              }}>
                {userName}
              </div>

              {/* Rating - bigger, more prominent */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
              }}>
                <div style={{
                  fontSize: '9px',
                  color: theme.accent,
                  fontWeight: '500',
                  letterSpacing: '1px',
                  fontFamily: '"Noto Serif SC", serif',
                }}>
                  蒸馏评级
                </div>
                <div style={{
                  fontSize: '22px',
                  fontWeight: '900',
                  color: theme.ratingColor,
                  fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif',
                  textShadow: `1px 1px 0 ${theme.cornerTint}`,
                  lineHeight: 1.1,
                }}>
                  {rating}
                </div>
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }} />

              {/* QR code */}
              <div style={{
                width: '64px',
                height: '64px',
                border: `1.5px solid ${theme.border}`,
                borderRadius: '8px',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fff',
                opacity: 0.9,
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
                      p.innerHTML = `<div style="font-size:8px;color:${theme.text};text-align:center;padding:4px;line-height:1.4;">知识蒸馏馆</div>`
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
              gap: '10px',
              minWidth: 0,
              position: 'relative',
            }}>
              {/* Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <div style={{
                  background: theme.badgeBg,
                  borderRadius: '4px',
                  padding: '2px 7px',
                  fontSize: '10px',
                  color: '#fff',
                  fontWeight: '700',
                  letterSpacing: '1px',
                  fontFamily: '"Noto Serif SC", serif',
                }}>
                  知识蒸馏馆
                </div>
                <div style={{
                  fontSize: '9px',
                  color: theme.accent,
                  fontWeight: '400',
                  opacity: 0.7,
                  fontFamily: '"Noto Serif SC", serif',
                }}>
                  AI 生成 · 仅供参考
                </div>
              </div>

              {/* Skill description */}
              <div style={{
                flex: 1,
                border: `1.5px solid ${theme.border}`,
                borderRadius: '10px',
                padding: '12px',
                background: 'rgba(255,255,255,0.65)',
                display: 'flex',
                alignItems: 'flex-start',
                position: 'relative',
                overflow: 'hidden',
              }}>
                {/* Subtle watermark */}
                <div style={{
                  position: 'absolute',
                  top: '50%', left: '50%',
                  transform: 'translate(-50%,-50%) rotate(-20deg)',
                  fontSize: '38px',
                  color: theme.border,
                  opacity: 0.06,
                  fontFamily: '"Ma Shan Zheng", serif',
                  pointerEvents: 'none',
                  whiteSpace: 'nowrap',
                  fontWeight: '900',
                }}>
                  知识蒸馏
                </div>
                <p style={{
                  fontSize: '12.5px',
                  color: theme.text,
                  lineHeight: '1.75',
                  margin: 0,
                  fontFamily: '"Noto Serif SC", serif',
                  fontWeight: '400',
                  position: 'relative',
                }}>
                  {cardDesc}
                </p>
              </div>

              {/* Bottom tagline */}
              <div style={{
                fontSize: '11px',
                color: theme.primary,
                fontWeight: '700',
                textAlign: 'right',
                fontFamily: '"Ma Shan Zheng", "Noto Serif SC", serif',
                letterSpacing: '0.5px',
                opacity: 0.85,
              }}>
                扫码加入，蒸馏你自己 ✨
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
