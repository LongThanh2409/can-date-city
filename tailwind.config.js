/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#12211f',
        canvas: '#f5f7f6',
        brand: { 50: '#effcf9', 100: '#d7f7f0', 500: '#14947e', 600: '#0f766e', 700: '#105f59', 900: '#113d39' },
      },
      boxShadow: { panel: '0 10px 32px rgba(18,33,31,.08)' },
    },
  },
  plugins: [],
}
