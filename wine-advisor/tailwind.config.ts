import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        wine: {
          50: "#fdf2f4",
          100: "#fce7eb",
          200: "#f9d0d9",
          300: "#f4a9b8",
          400: "#ed7793",
          500: "#e14d70",
          600: "#cd2d5a",
          700: "#ac2049",
          800: "#901e41",
          900: "#7b1d3c",
          950: "#440b1d",
        },
        cream: {
          50: "#fefcf3",
          100: "#fdf8e1",
          200: "#fbf0c3",
          300: "#f7e39a",
          400: "#f2cf66",
        },
      },
    },
  },
  plugins: [],
};
export default config;
