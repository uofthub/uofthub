import { describe, expect, it } from 'vitest'
import { TEMPLATES, templateFor } from './courseTemplates.js'
import { isCourseCode } from './faculties.js'

describe('course templates', () => {
  it('are each keyed by a full, unique course code', () => {
    const codes = TEMPLATES.map((t) => t.code)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of codes) {
      expect(isCourseCode(code), code).toBe(true)
      expect(code).toBe(code.toUpperCase())
      expect(templateFor(code.toLowerCase())?.code).toBe(code)
    }
  })

  it('give every custom section a heading and every section a prompt', () => {
    for (const template of TEMPLATES) {
      expect(template.sections.length, template.code).toBeGreaterThan(0)
      for (const section of template.sections) {
        expect(section.prompt.trim(), template.code).not.toBe('')
        if (section.kind === 'custom') expect(section.title?.trim(), template.code).toBeTruthy()
      }
      const kinds = template.sections.filter((s) => s.kind !== 'custom').map((s) => s.kind)
      expect(new Set(kinds).size, `${template.code} repeats a section kind`).toBe(kinds.length)
    }
  })
})
