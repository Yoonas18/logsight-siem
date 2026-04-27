/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#071019",
          900: "#0d1724",
          850: "#111d2b",
          800: "#162436",
          700: "#24364d",
        },
        signal: {
          cyan: "#39d5ff",
          green: "#5ef0a3",
          amber: "#f7c948",
          red: "#ff6b6b",
        },
      },
      boxShadow: {
        panel: "0 18px 60px rgba(2, 8, 23, 0.18)",
      },
    },
  },
  plugins: [],
};
