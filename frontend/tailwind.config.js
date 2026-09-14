/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Warm ink — the restrained charcoal used by the gold reader system
        midnight: {
          DEFAULT: '#090a0c',
          deep: '#0f1114',
          panel: '#15181c'
        },
        // Warm ivory for document content and readable controls
        ivory: '#f7f3ea',
        // Gold hierarchy: primary actions, active states, and focus signals
        primary: {
          DEFAULT: '#c5a15a',
          hover: '#d7b873'
        },
        secondary: '#e8be6a',
        accent: '#f4d696',
        glass: {
          dark: 'rgba(21, 24, 28, 0.78)',
          borderDark: 'rgba(232, 190, 106, 0.18)',
          light: 'rgba(255, 255, 255, 0.82)',
          borderLight: 'rgba(28, 17, 8, 0.14)'
        }
      },
      fontFamily: {
        sans: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesk', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'monospace']
      },
      backgroundImage: {
        aurora:
          'radial-gradient(ellipse 80% 60% at 20% -10%, rgba(232,190,106,0.10), transparent 60%), radial-gradient(ellipse 60% 50% at 90% 0%, rgba(244,214,150,0.08), transparent 55%), radial-gradient(ellipse 70% 60% at 50% 110%, rgba(255,247,224,0.03), transparent 60%)'
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
          '0%, 100%': { boxShadow: '0 0 20px rgba(232,190,106,0.18)' },
          '50%': { boxShadow: '0 0 42px rgba(232,190,106,0.35)' }
        }
      }
    }
  },
  plugins: []
};
