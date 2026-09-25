import type { Config } from 'tailwindcss';
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"Inter Variable"', 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      colors: {
        brand: {
          50: '#effaf8',
          100: '#d6f2ed',
          200: '#ade4da',
          300: '#7dcfc2',
          400: '#4fb3a6',
          500: '#32978b',
          600: '#257a71',
          700: '#20625c',
          800: '#1d4f4b',
          900: '#1a423f',
        },
        ink: {
          50: '#f7f7f5',
          100: '#efeeea',
          200: '#e2e0da',
          300: '#cbc8bf',
          400: '#a29e93',
          500: '#7b776c',
          600: '#5e5a51',
          700: '#46433c',
          800: '#2e2c27',
          900: '#1c1b18',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(28,27,24,0.04), 0 1px 3px rgba(28,27,24,0.06)',
        pop: '0 12px 32px -8px rgba(28,27,24,0.22), 0 2px 6px rgba(28,27,24,0.08)',
      },
    },
  },
  plugins: [typography],
} satisfies Config;
