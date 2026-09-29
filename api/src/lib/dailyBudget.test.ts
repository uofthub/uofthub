import { describe, expect, it } from 'vitest'
import { dailyBudget } from './dailyBudget.js'

describe('dailyBudget', () => {
  it('stops each student at their allowance and everyone at the site’s', () => {
    const budget = dailyBudget({ perStudent: () => 2, perSite: () => 3 })
    expect(budget.spend('a')).toBe(true)
    expect(budget.spend('a')).toBe(true)
    expect(budget.spend('a')).toBe(false)
    expect(budget.spend('b')).toBe(true)
    expect(budget.spend('c')).toBe(false)
    budget.reset()
    expect(budget.spend('c')).toBe(true)
  })
})
