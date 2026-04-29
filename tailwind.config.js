/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts}'],
  corePlugins: {
    preflight: false, // keep our own reset in global.scss
  },
  theme: {
    extend: {
      colors: {
        // Backgrounds — darkest → lightest
        void:    '#080808',
        deep:    '#0e0e0f',
        surface: '#141416',
        raised:  '#1c1c20',
        elevated:'#242428',

        // Accent
        gold: {
          DEFAULT: '#c9a84c',
          dim:     '#8a6f2e',
        },
        crimson: {
          DEFAULT: '#c0392b',
        },

        // Text
        parchment: {
          DEFAULT: '#f0e8d8',
          muted:   '#c4b8a8',
          faint:   '#8a8070',
        },

        // Mana pip colors
        mana: {
          w: '#f0e6c8',
          u: '#4a90d9',
          b: '#9b59b6',
          r: '#e74c3c',
          g: '#27ae60',
          c: '#95a5a6',
        },
      },

      // Border colors can use any color + white/opacity shorthand (border-white/10)
      // Custom named border shades for convenience
      borderColor: ({ theme }) => ({
        ...theme('colors'),
        dim:    'rgba(255,255,255,0.06)',
        subtle: 'rgba(255,255,255,0.10)',
        lit:    'rgba(255,255,255,0.18)',
      }),

      fontFamily: {
        display: ['Cinzel', 'serif'],
        body:    ['system-ui', '-apple-system', '"Segoe UI"', 'Roboto', 'sans-serif'],
      },

      boxShadow: {
        'gold':     '0 0 0 2px #c9a84c, 0 0 20px rgba(201,168,76,0.4)',
        'gold-sm':  '0 0 0 2px #c9a84c, 0 0 16px rgba(201,168,76,0.35)',
        'crimson':  '0 0 0 2px #e74c3c, 0 0 18px rgba(231,76,60,0.45)',
        'castable': '0 0 0 1px rgba(39,174,96,0.5), 0 0 12px rgba(39,174,96,0.2)',
      },

      keyframes: {
        'pulse-gold': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%':       { opacity: '0.6', transform: 'scale(0.85)' },
        },
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'scale(0.94)' },
          to:   { opacity: '1', transform: 'scale(1)' },
        },
        'spin': {
          from: { transform: 'rotate(0deg)' },
          to:   { transform: 'rotate(360deg)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        'dropdown-in': {
          from: { opacity: '0', transform: 'translateY(-6px) scale(0.97)' },
          to:   { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'pulse-gold': 'pulse-gold 2s ease-in-out infinite',
        'fade-in':    'fade-in 0.2s ease',
        'slide-up':   'slide-up 0.25s ease',
        'scale-in':   'scale-in 0.2s ease',
        'spin':       'spin 1s linear infinite',
        'fade-up':      'fade-up 0.4s cubic-bezier(0.22, 1, 0.36, 1)',
        'dropdown-in':  'dropdown-in 0.15s cubic-bezier(0.22, 1, 0.36, 1)',
      },

      transitionTimingFunction: {
        'panel': 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
