/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/renderer/src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#1e40af',
        secondary: '#06b6d4',
      },
    },
  },
  plugins: [],
  darkMode: ['selector', '[data-theme="dark"]']
}
