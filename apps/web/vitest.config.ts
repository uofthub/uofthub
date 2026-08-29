import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

/**
 * Separate from vite.config.ts on purpose: the tests want React but not
 * Tailwind, and pulling the Tailwind plugin into every run costs a CSS build
 * that nothing here asserts on.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
