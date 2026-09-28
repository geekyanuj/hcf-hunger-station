/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#e8590c',
          600: '#c2410c',
          700: '#9a3412',
          800: '#7c2d12',
          900: '#431407',
        },
        ink: {
          900: '#1a1210',
          800: '#2b1f1b',
        },
      },
      fontFamily: {
        display: ['"Poppins"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 10px rgba(0,0,0,0.06)',
        floating: '0 8px 24px rgba(0,0,0,0.12)',
      },
      borderRadius: {
        xl2: '1.25rem',
      },
    },
  },
  plugins: [],
};
