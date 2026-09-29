/**
 * A day's allowance of something that costs us money per call — model
 * credits, above all — per student and for the whole site.
 *
 * A rate limit alone does not cap spend: it bounds calls per window, and
 * windows keep coming. This is the hard ceiling behind it. Kept in memory: a
 * restart forgets it, which at worst allows one extra day's budget — not
 * worth a table. Limits are read on every call, so a deployment can override
 * them through the environment and tests can change them mid-run.
 */
export type DailyBudget = {
  /** Takes one call from today's budgets, or says there is none left. */
  spend(userId: string): boolean
  /** For tests: forget today's spending. */
  reset(): void
}

export function dailyBudget(limits: {
  perStudent: () => number
  perSite: () => number
}): DailyBudget {
  let day = ''
  let siteCalls = 0
  const studentCalls = new Map<string, number>()

  return {
    spend(userId) {
      const today = new Date().toISOString().slice(0, 10)
      if (today !== day) {
        day = today
        siteCalls = 0
        studentCalls.clear()
      }
      const mine = studentCalls.get(userId) ?? 0
      if (siteCalls >= limits.perSite() || mine >= limits.perStudent()) return false
      siteCalls++
      studentCalls.set(userId, mine + 1)
      return true
    },
    reset() {
      day = ''
      siteCalls = 0
      studentCalls.clear()
    },
  }
}

/** A non-negative integer from the environment, or the fallback. */
export function envInt(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}
