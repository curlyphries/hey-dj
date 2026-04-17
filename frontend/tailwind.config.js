/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: { DEFAULT: '#0f0f1a', 1: '#16162a', 2: '#1e1e38', 3: '#26264a' },
        accent:  { DEFAULT: '#7c3aed', light: '#a78bfa', glow: '#7c3aed33' },
        beat:    { DEFAULT: '#ec4899', glow: '#ec489933' },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}
