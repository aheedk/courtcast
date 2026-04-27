import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        good: '#16a34a', // green-600
        ok: '#eab308',   // yellow-500
        bad: '#dc2626',  // red-600
      },
    },
  },
  plugins: [],
} satisfies Config;
