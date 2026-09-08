/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warm ink — a deep roasted charcoal with an orange undertone
        midnight: {
          DEFAULT: '#170d06',
          deep: '#1f1207',
          panel: '#291a0d'
        },
        // Warm cream — Saraswati ivory
        ivory: '#fff7ed',
        // Saffron — the study-hall primary
        primary: {
          DEFAULT: '#f97316',
          hover: '#fb923c'
        },
        secondary: '#fec38d',
        accent: '#f59e0b',
        glass: {
          dark: 'rgba(41, 26, 13, 0.66)',
          borderDark: 'rgba(255, 237, 213, 0.17)',
          light: 'rgba(255, 255, 255, 0.82)',
          borderLight: 'rgba(23, 13, 6, 0.12)'
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      backgroundImage: {
        aurora:
          'radial-gradient(ellipse 80% 60% at 20% -10%, rgba(249,115,22,0.24), transparent 60%), radial-gradient(ellipse 60% 50% at 90% 0%, rgba(245,158,11,0.18), transparent 55%), radial-gradient(ellipse 70% 60% at 50% 110%, rgba(255,237,213,0.06), transparent 60%)'
      },
      animation: {
        'fade-up': 'fadeUp 0.5s ease-out both',
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        shimmer: 'shimmer 2.5s linear infinite',
        float: 'float 7s ease-in-out infinite',
        glow: 'glow 3.5s ease-in-out infinite'
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(14px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' }
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' }
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(249,115,22,0.35)' },
          '50%': { boxShadow: '0 0 42px rgba(245,158,11,0.55)' }
        }
      }
    }
  },
  plugins: []
};
