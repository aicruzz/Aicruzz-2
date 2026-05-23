import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AiCruzz brand palette
        brand: {
          50: '#f0f4ff',
          100: '#dce8ff',
          200: '#b9d0ff',
          300: '#85aeff',
          400: '#4d82ff',
          500: '#2563eb',
          600: '#1d4ed8',
          700: '#1e40af',
          800: '#1e3a8a',
          900: '#1e3a8a',
        },
        accent: {
          400: '#a855f7',
          500: '#9333ea',
          600: '#7c3aed',
        },
        surface: {
          900: '#0a0a0f',
          800: '#0f0f1a',
          700: '#14142a',
          600: '#1a1a35',
          500: '#222240',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'brand-gradient': 'linear-gradient(135deg, #2563eb 0%, #7c3aed 100%)',
        'card-gradient': 'linear-gradient(135deg, rgba(37,99,235,0.1) 0%, rgba(124,58,237,0.1) 100%)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(37,99,235,0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(124,58,237,0.5)' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};

export default config;
