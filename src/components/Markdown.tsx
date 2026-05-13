import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

type Tone = 'light' | 'invert'

interface MarkdownProps {
  content: string
  tone?: Tone
  className?: string
}

const toneStyles: Record<Tone, {
  text: string
  link: string
  codeInline: string
  codeBlock: string
  quote: string
  divider: string
  tableBorder: string
  tableHead: string
}> = {
  light: {
    text: 'text-zhihu-ink',
    link: 'text-zhihu-blue hover:underline',
    codeInline: 'bg-gray-100 text-rose-600 px-1 py-0.5 rounded text-[0.85em] font-mono',
    codeBlock: 'bg-gray-900 text-gray-100',
    quote: 'border-l-4 border-zhihu-blue/40 bg-zhihu-blue/5 text-zhihu-ink/80',
    divider: 'border-gray-200',
    tableBorder: 'border-gray-200',
    tableHead: 'bg-gray-50 text-zhihu-ink'
  },
  invert: {
    text: 'text-white',
    link: 'text-white underline underline-offset-2 hover:opacity-90',
    codeInline: 'bg-white/20 text-white px-1 py-0.5 rounded text-[0.85em] font-mono',
    codeBlock: 'bg-black/30 text-white',
    quote: 'border-l-4 border-white/50 bg-white/10 text-white',
    divider: 'border-white/30',
    tableBorder: 'border-white/30',
    tableHead: 'bg-white/15 text-white'
  }
}

export default function Markdown({ content, tone = 'light', className = '' }: MarkdownProps) {
  const s = toneStyles[tone]

  const components: Components = {
    p: ({ children }) => (
      <p className={`my-2 first:mt-0 last:mb-0 leading-relaxed ${s.text}`}>{children}</p>
    ),
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer noopener" className={s.link}>
        {children}
      </a>
    ),
    strong: ({ children }) => (
      <strong className={`font-semibold ${s.text}`}>{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    ul: ({ children }) => (
      <ul className={`my-2 pl-5 list-disc space-y-1 first:mt-0 last:mb-0 ${s.text}`}>
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className={`my-2 pl-5 list-decimal space-y-1 first:mt-0 last:mb-0 ${s.text}`}>
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-relaxed">{children}</li>,
    h1: ({ children }) => (
      <h1 className={`mt-4 mb-2 text-lg font-bold first:mt-0 ${s.text}`}>{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className={`mt-4 mb-2 text-base font-bold first:mt-0 ${s.text}`}>{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className={`mt-3 mb-1.5 text-sm font-bold first:mt-0 ${s.text}`}>{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className={`mt-3 mb-1.5 text-sm font-semibold first:mt-0 ${s.text}`}>{children}</h4>
    ),
    blockquote: ({ children }) => (
      <blockquote className={`my-2 pl-3 py-1.5 pr-2 rounded-r ${s.quote}`}>
        {children}
      </blockquote>
    ),
    hr: () => <hr className={`my-3 ${s.divider}`} />,
    code: ({ className: cls, children, ...rest }) => {
      const isBlock = /language-/.test(cls || '')
      if (isBlock) {
        return (
          <code className={`block whitespace-pre ${cls || ''}`} {...rest}>
            {children}
          </code>
        )
      }
      return (
        <code className={s.codeInline} {...rest}>
          {children}
        </code>
      )
    },
    pre: ({ children }) => (
      <pre className={`my-2 p-3 rounded-lg overflow-x-auto text-xs leading-relaxed ${s.codeBlock}`}>
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="my-2 overflow-x-auto">
        <table className={`w-full text-left border-collapse text-[0.9em] ${s.text}`}>
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className={s.tableHead}>{children}</thead>,
    th: ({ children }) => (
      <th className={`px-2 py-1.5 border ${s.tableBorder} font-semibold`}>{children}</th>
    ),
    td: ({ children }) => (
      <td className={`px-2 py-1.5 border ${s.tableBorder} align-top`}>{children}</td>
    )
  }

  return (
    <div className={`markdown-body ${s.text} ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
