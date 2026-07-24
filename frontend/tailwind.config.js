/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        canvas: '#0d1117',
        surface: '#161b22',
        elevated: '#21262d',
        border: '#30363d',
        foreground: '#f0f6fc',
        muted: '#8b949e',
        accent: '#2f81f7'
      }
    }
  },
  plugins: []
};
