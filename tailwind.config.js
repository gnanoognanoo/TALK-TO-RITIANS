/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        slate: {
          50: '#F9FAF9',
          100: '#F2F5F2', // Primary text in dark mode
          200: '#E2EBE2',
          300: '#C5D1C5',
          400: '#AEB9AE', // Secondary text in dark mode
          500: '#758275', // Muted text in dark mode
          600: '#4A574A',
          700: 'rgba(120, 160, 100, 0.22)',
          750: 'rgba(120, 160, 100, 0.18)',
          800: '#101A12', // Elevated surface in dark mode
          850: '#0E1710',
          900: '#0D150F', // Card background in dark mode
          950: '#050806', // Base page background in dark mode
        },
        chemical: {
          base: '#050806',
          secondary: '#0A100B',
          card: '#0D150F',
          surface: '#101A12',
          border: 'rgba(120, 160, 100, 0.16)',
          accent: '#8FAF56',
          bright: '#A8C96A',
          deep: '#56733A',
          success: '#7FAE61',
          text: '#F2F5F2',
          subtext: '#AEB9AE',
          muted: '#758275',
        },
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#7c5cfc',
          600: '#6c4cf5', // Primary brand purple
          700: '#5b3ce3',
          800: '#4c2fd1',
          900: '#3b1fa6',
          950: '#23126d',
        },
        surface: {
          DEFAULT: '#ffffff',
          card: '#ffffff',
          canvas: '#f8fafc',
          subtle: '#f1f5f9',
          border: '#e5e7eb',
        },
      },
      boxShadow: {
        card: '0 4px 14px rgba(0, 0, 0, 0.05)',
        subtle: '0 1px 3px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.06)',
        dropdown: '0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)',
      },
      borderRadius: {
        'card': '14px',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'soft-ping': 'ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite',
      },
    },
  },
  plugins: [],
};
