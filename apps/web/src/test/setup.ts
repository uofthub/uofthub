import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom keeps the document between tests in a file; without this, a query like
// getByText would find the previous test's tree as well as this one's.
afterEach(cleanup)
