import type { OutputKind, ProjectType, ReferenceKind } from '@prisma/client'
import type { SectionKind } from '@uofthub/types'

/**
 * Course templates: what a course asks its students to show, used only to
 * pre-fill the editor.
 *
 * A template never makes anything required and never locks anything. It
 * suggests a type, a primary output and a set of sections with prompts; the
 * student writes what they like, and anything they leave empty is stripped on
 * save like any other empty section. The prompts are placeholder text and are
 * never stored.
 *
 * Templates live here, as reviewed code, rather than in a table: they change
 * rarely, there is no screen to edit one, and a seeded row would need a new
 * migration for every wording change. Each project records the template and
 * version it started from (`templateCode`, `templateVersion`), so moving them
 * to the database later, if instructors need to edit their own, loses nothing.
 * Bump `version` whenever a template's structure changes.
 */

export type TemplateSection = {
  kind: SectionKind
  /** The heading, when the course calls it something other than the kind's label. */
  title?: string
  /** Placeholder guidance. Never saved. */
  prompt: string
  /** Named items, for an approaches or examples section. */
  items?: { label: string; prompt?: string }[]
}

export type CourseTemplate = {
  code: string
  version: number
  type: ProjectType
  /** One line shown at the top of the editor. */
  intro: string
  primaryOutput: { kind: OutputKind; prompt: string; accept?: string }
  sections: TemplateSection[]
  references?: { kinds: ReferenceKind[]; prompt: string }
}

const TEMPLATES: CourseTemplate[] = [
  {
    code: 'CSC211H5',
    version: 1,
    type: 'RESEARCH',
    intro:
      'Compare how people, classic algorithms, deep learning and LLM prompting do on one task.',
    primaryOutput: {
      kind: 'POSTER',
      prompt: 'Upload your poster as a PDF. Its first page becomes the project’s image.',
      accept: '.pdf,application/pdf',
    },
    sections: [
      {
        kind: 'motivation',
        title: 'Task & motivation',
        prompt: 'What task did you take on, who has it, and why does doing it well matter?',
      },
      {
        kind: 'data',
        title: 'Data & evaluation setup',
        prompt:
          'Which data did you use, how was it split, and how did you decide what counts as a good answer?',
      },
      {
        kind: 'approaches',
        title: 'Approaches',
        prompt: 'How each approach was set up, in enough detail that a classmate could repeat it.',
        items: [
          { label: 'Human baseline', prompt: 'Who did the task by hand, and how?' },
          { label: 'Algorithmic', prompt: 'The rule-based or classic method, and its settings.' },
          { label: 'Deep learning', prompt: 'The model, how it was trained, and on what.' },
          { label: 'LLM prompting', prompt: 'The model and the prompts, including any examples given.' },
        ],
      },
      {
        kind: 'results',
        title: 'Results',
        prompt: 'How did each approach do on your measure? A table works well here.',
      },
      {
        kind: 'examples',
        title: 'Examples & failure analysis',
        prompt: 'A few inputs the approaches got right and wrong, and what you think explains it.',
      },
      {
        kind: 'considerations',
        title: 'Trade-offs & responsible use',
        prompt:
          'Cost, speed, accuracy, bias, privacy — what would someone weigh before using each approach?',
      },
      {
        kind: 'conclusion',
        title: 'Recommendation',
        prompt: 'Which approach would you recommend, for whom, and why?',
      },
    ],
    references: {
      kinds: ['DATASET', 'PAPER', 'MODEL', 'SOFTWARE'],
      prompt: 'The datasets, papers, models and tools you used.',
    },
  },
]

/** A U of T course code — mirrors isCourseCode in lib/faculties.ts. */
const STEM = /^[A-Z]{3}\d{3}$/

/**
 * The template for a course. An exact code wins; a bare stem (CSC211) finds a
 * template only when exactly one course shares it, since CSC211H1 and CSC211H5
 * are different courses on different campuses.
 */
export function templateFor(rawCode: string): CourseTemplate | null {
  const code = rawCode.trim().toUpperCase()
  const exact = TEMPLATES.find((t) => t.code === code)
  if (exact) return exact
  if (!STEM.test(code)) return null
  const matches = TEMPLATES.filter((t) => t.code.startsWith(code))
  return matches.length === 1 ? matches[0] : null
}

/** Whether a project may say it started from this template at this version. */
export const isKnownTemplate = (code: string, version: number) => {
  const template = TEMPLATES.find((t) => t.code === code)
  return !!template && Number.isInteger(version) && version >= 1 && version <= template.version
}
