const { join } = require('path');
const uiConfig = require('@teable/ui-lib/ui.config.cjs');
const filePath = join(__dirname, './src/**/*.{js,ts,jsx,tsx}');
const sdkPath = join(__dirname, '../../packages/sdk/src/**/*.{js,ts,jsx,tsx}');
const uiLibPath = join(__dirname, '../../packages/ui-lib/src/**/*.{js,ts,jsx,tsx}');
const scrollbarPlugin = require('tailwind-scrollbar');

/** @type {import('tailwindcss').Config} */
module.exports = uiConfig({
  content: [filePath, sdkPath, uiLibPath],
  darkMode: ['class', 'class'],
  theme: {
    extend: {
      keyframes: {
        'accordion-down': {
          from: {
            height: '0',
          },
          to: {
            height: 'var(--radix-accordion-content-height)',
          },
        },
        'accordion-up': {
          from: {
            height: 'var(--radix-accordion-content-height)',
          },
          to: {
            height: '0',
          },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [
    scrollbarPlugin({ nocompatible: true }),
    function ({ addUtilities }) {
      const newUtilities = {
        '.scrollbar-min-thumb': {
          '&::-webkit-scrollbar-thumb': {
            minHeight: '32px',
          },
          '&::-webkit-scrollbar-thumb:vertical': {
            minHeight: '32px',
          },
        },
      };

      addUtilities(newUtilities);
    },
    require('@tailwindcss/container-queries'),
  ],
});
