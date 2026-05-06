/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Forge palette — cool charcoal field, electric blue accent, violet secondary.
        // Inspired by developer-tool aesthetics (Linear, Raycast, GitHub Dark).
        forge: {
          bg:        '#0A0B0D',
          surface:   '#14171C',
          surfaceHi: '#1C2028',
          surface2:  '#22262E',
          border:    '#2D3239',
          divider:   '#1F2329',
          text:      '#E5E7EB',
          mute:      '#9CA3AF',
          dim:       '#6B7280',
          subtle:    '#4B5563',
          primary:   '#4F8EFF',
          primaryHi: '#6BA0FF',
          primaryLo: '#3A6FE0',
          accent:    '#A78BFA',
          accentHi:  '#C4B5FD',
          ok:        '#10B981',
          warn:      '#F59E0B',
          err:       '#F43F5E',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Inter', 'system-ui', '"Segoe UI"', 'Roboto', 'sans-serif'],
        mono: ['ui-monospace', '"JetBrains Mono"', '"SF Mono"', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['10px', { lineHeight: '14px', letterSpacing: '0.04em' }],
        micro: ['9px', { lineHeight: '12px', letterSpacing: '0.18em' }],
      },
      letterSpacing: {
        wider2: '0.16em',
        wider3: '0.22em',
      },
      boxShadow: {
        glass:    '0 1px 0 rgba(255,255,255,0.04) inset, 0 30px 60px -30px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.4)',
        glassHi:  '0 1px 0 rgba(255,255,255,0.08) inset, 0 40px 80px -30px rgba(0,0,0,0.9), 0 2px 6px rgba(0,0,0,0.5)',
        primaryGlow: '0 0 0 1px rgba(79,142,255,0.4) inset, 0 12px 32px -8px rgba(79,142,255,0.45)',
        primarySoft: '0 8px 24px -8px rgba(79,142,255,0.4)',
        innerHi:  '0 1px 0 rgba(255,255,255,0.08) inset',
        focusBlue: '0 0 0 3px rgba(79,142,255,0.18)',
      },
      backgroundImage: {
        'primary-gradient':      'linear-gradient(135deg, #4F8EFF 0%, #A78BFA 100%)',
        'primary-gradient-soft': 'linear-gradient(135deg, rgba(79,142,255,0.18) 0%, rgba(167,139,250,0.12) 100%)',
        'panel-gradient':        'linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
      },
      keyframes: {
        shimmer:  { '0%': { backgroundPosition: '-200% 0' }, '100%': { backgroundPosition: '200% 0' } },
        pulseDot: { '0%, 100%': { opacity: '0.85', transform: 'scale(1)' }, '50%': { opacity: '0.45', transform: 'scale(0.85)' } },
        bloom:    { '0%, 100%': { opacity: '0.55' }, '50%': { opacity: '1' } },
        fadeUp:   { '0%': { opacity: '0', transform: 'translateY(6px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
      },
      animation: {
        shimmer:  'shimmer 2.6s linear infinite',
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
        bloom:    'bloom 5s ease-in-out infinite',
        fadeUp:   'fadeUp 220ms ease-out',
      },
      screens: {
        // Forge-specific narrow breakpoint for dense desktop layouts
        'xs': '480px',
      },
    },
  },
  plugins: [],
};
