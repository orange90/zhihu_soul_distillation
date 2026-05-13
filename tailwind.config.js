/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        zhihu: {
          blue: '#0066FF',
          'blue-dark': '#0052cc',
          'blue-light': '#e6f0ff',
          ink: '#1a1a1a',
          gray: '#8590a6',
          bg: '#f6f6f6'
        }
      },
      fontFamily: {
        sans: [
          '-apple-system',
          'BlinkMacSystemFont',
          '"PingFang SC"',
          '"Hiragino Sans GB"',
          '"Microsoft YaHei"',
          'sans-serif'
        ]
      }
    }
  },
  plugins: []
}
