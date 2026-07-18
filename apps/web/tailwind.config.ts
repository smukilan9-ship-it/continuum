import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#171b18",
        paper: "#f5f3ed",
        moss: "#214e3d",
        lime: "#c7ed66",
        rust: "#d76f4a",
      },
    },
  },
  plugins: [animate],
};

export default config;
