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

export const TEMPLATES: CourseTemplate[] = [
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
          {
            label: 'LLM prompting',
            prompt: 'The model and the prompts, including any examples given.',
          },
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
  {
    code: 'CSC301H1',
    version: 1,
    type: 'APP',
    intro: 'A team building real software for a partner, and what the team learned doing it.',
    primaryOutput: {
      kind: 'DEMO',
      prompt: 'Link the running app, or a short demo video if it can’t be public.',
    },
    sections: [
      {
        kind: 'motivation',
        title: 'Partner & problem',
        prompt: 'Who is the partner, what did they need, and who will use what you built?',
      },
      {
        kind: 'method',
        title: 'How the team worked',
        prompt: 'Roles, sprints, reviews, testing — how the team shipped one product.',
      },
      {
        kind: 'results',
        title: 'What shipped',
        prompt: 'The features that made it in, with screenshots, and what was cut.',
      },
      {
        kind: 'considerations',
        title: 'Architecture & trade-offs',
        prompt: 'The stack you picked, the decisions you’d defend, and the ones you’d revisit.',
      },
      {
        kind: 'reflection',
        title: 'Retrospective',
        prompt: 'What went well, what didn’t, and what you would change on the next project.',
      },
    ],
    references: {
      kinds: ['SOFTWARE', 'WEBSITE'],
      prompt: 'The frameworks, services and libraries the app runs on.',
    },
  },
  {
    code: 'CSC309H1',
    version: 1,
    type: 'APP',
    intro: 'A full-stack web app: what it does, how it is built, and how it holds up.',
    primaryOutput: {
      kind: 'DEMO',
      prompt: 'Link the deployed site. Add the repository as a second output.',
    },
    sections: [
      {
        kind: 'motivation',
        title: 'What it does',
        prompt: 'Who the app is for and the problem it solves for them, in a paragraph.',
      },
      {
        kind: 'method',
        title: 'Architecture',
        prompt: 'Frontend, backend, database and hosting — and how a request moves through them.',
      },
      {
        kind: 'results',
        title: 'Features',
        prompt: 'A tour of the main screens. Screenshots or a short clip work well.',
      },
      {
        kind: 'considerations',
        title: 'Security & accessibility',
        prompt: 'How you handle sign-in, user input and access control, and who can use it.',
      },
      {
        kind: 'reflection',
        prompt: 'What was harder than expected, and what you would build differently.',
      },
    ],
    references: {
      kinds: ['SOFTWARE', 'WEBSITE'],
      prompt: 'Frameworks, APIs and services the app depends on.',
    },
  },
  {
    code: 'ECE496Y1',
    version: 1,
    type: 'HARDWARE',
    intro: 'A year-long design project, from requirements to a verified final design.',
    primaryOutput: {
      kind: 'POSTER',
      prompt:
        'Upload your design fair poster as a PDF. Its first page becomes the project’s image.',
      accept: '.pdf,application/pdf',
    },
    sections: [
      {
        kind: 'motivation',
        title: 'Problem & requirements',
        prompt: 'The need, who has it, and the requirements a solution has to meet.',
      },
      {
        kind: 'approaches',
        title: 'Design alternatives',
        prompt: 'The options you considered and how you chose between them.',
      },
      {
        kind: 'method',
        title: 'Final design',
        prompt: 'How the final design works: block diagram, key components, and why those.',
      },
      {
        kind: 'results',
        title: 'Testing & verification',
        prompt: 'How you tested it against each requirement, and what the results were.',
      },
      {
        kind: 'considerations',
        title: 'Constraints & impact',
        prompt: 'Cost, safety, standards, and who the design affects beyond its users.',
      },
      {
        kind: 'conclusion',
        title: 'Next steps',
        prompt: 'What is left to do, and what you’d tell a team picking this up.',
      },
    ],
    references: {
      kinds: ['PAPER', 'SOFTWARE', 'WEBSITE', 'OTHER'],
      prompt: 'Datasheets, standards, papers and tools the design relies on.',
    },
  },
  {
    code: 'APS112H1',
    version: 1,
    type: 'DESIGN',
    intro: 'A first-year design project for a real client: framing the problem, then answering it.',
    primaryOutput: {
      kind: 'PAPER',
      prompt: 'Upload your final design report as a PDF.',
      accept: '.pdf,application/pdf',
    },
    sections: [
      {
        kind: 'motivation',
        title: 'Client & problem statement',
        prompt: 'Who the client is, and the gap between what exists and what they need.',
      },
      {
        kind: 'custom',
        title: 'Objectives, constraints & metrics',
        prompt: 'What a good design does, what it must never do, and how you measure both.',
      },
      {
        kind: 'approaches',
        title: 'Conceptual designs',
        prompt: 'The concepts your team generated, and how you compared them.',
      },
      {
        kind: 'results',
        title: 'Proposed design',
        prompt:
          'The design you recommend, with sketches or renders, and how it meets the objectives.',
      },
      {
        kind: 'considerations',
        title: 'Stakeholders & impact',
        prompt: 'Who else the design affects — socially, environmentally, economically.',
      },
      {
        kind: 'reflection',
        title: 'Working as a team',
        prompt: 'What your team learned about designing together.',
      },
    ],
    references: {
      kinds: ['PAPER', 'WEBSITE', 'BOOK', 'OTHER'],
      prompt: 'Standards, research and prior designs you drew on.',
    },
  },
  {
    code: 'STA302H1',
    version: 1,
    type: 'RESEARCH',
    intro: 'A question answered with a regression model — and an honest look at whether it fits.',
    primaryOutput: {
      kind: 'PAPER',
      prompt: 'Upload your report as a PDF. Add your code as a second output.',
      accept: '.pdf,application/pdf',
    },
    sections: [
      {
        kind: 'motivation',
        title: 'Research question',
        prompt: 'The question, why it is worth asking, and what answering it would change.',
      },
      {
        kind: 'data',
        prompt: 'Where the data comes from, what each variable measures, and what you cleaned.',
      },
      {
        kind: 'method',
        title: 'Model',
        prompt: 'The model you settled on, the ones you tried first, and how you chose.',
      },
      {
        kind: 'results',
        prompt: 'Your estimates, in plain language as well as a table.',
      },
      {
        kind: 'considerations',
        title: 'Diagnostics & limitations',
        prompt: 'Which assumptions hold, which don’t, and what that means for your conclusions.',
      },
      {
        kind: 'conclusion',
        prompt: 'The answer to your question, and how confident you are in it.',
      },
    ],
    references: {
      kinds: ['DATASET', 'PAPER', 'SOFTWARE'],
      prompt: 'Your data source, the literature you cite, and the software you used.',
    },
  },
  {
    code: 'ECO375H1',
    version: 1,
    type: 'RESEARCH',
    intro: 'An empirical economics paper: a causal question, the data, and a credible estimate.',
    primaryOutput: {
      kind: 'PAPER',
      prompt: 'Upload your paper as a PDF.',
      accept: '.pdf,application/pdf',
    },
    sections: [
      {
        kind: 'motivation',
        title: 'Question & contribution',
        prompt: 'The economic question, what the literature already says, and what you add.',
      },
      {
        kind: 'data',
        prompt: 'The dataset, the sample you kept, and summary statistics for the key variables.',
      },
      {
        kind: 'method',
        title: 'Empirical strategy',
        prompt: 'Your specification, and why it identifies the effect you care about.',
      },
      {
        kind: 'results',
        prompt: 'The main estimates and how to read them.',
      },
      {
        kind: 'considerations',
        title: 'Robustness & threats to identification',
        prompt: 'Omitted variables, reverse causality, measurement — and the checks you ran.',
      },
      {
        kind: 'conclusion',
        prompt: 'What the evidence says, and what it would mean for policy.',
      },
    ],
    references: {
      kinds: ['DATASET', 'PAPER', 'SOFTWARE'],
      prompt: 'The data, the papers you build on, and the software you used.',
    },
  },
  {
    code: 'ENV461H1',
    version: 1,
    type: 'RESEARCH',
    intro:
      'Using the campus as a living lab: a sustainability problem studied with a campus partner.',
    primaryOutput: {
      kind: 'SLIDES',
      prompt: 'Upload your final presentation as a PDF.',
      accept: '.pdf,application/pdf',
    },
    sections: [
      {
        kind: 'motivation',
        title: 'Campus challenge',
        prompt: 'The sustainability problem, the partner who brought it, and why it matters here.',
      },
      {
        kind: 'method',
        title: 'Approach',
        prompt: 'What you did to study it — site visits, interviews, surveys, data you gathered.',
      },
      {
        kind: 'results',
        title: 'Findings',
        prompt: 'What you found, with the figures or quotes that show it.',
      },
      {
        kind: 'conclusion',
        title: 'Recommendations',
        prompt: 'What the partner should do next, and what it would take.',
      },
      {
        kind: 'reflection',
        prompt: 'What working with a real partner on a real problem taught you.',
      },
    ],
    references: {
      kinds: ['DATASET', 'PAPER', 'WEBSITE', 'OTHER'],
      prompt: 'Reports, data and research you drew on.',
    },
  },
]

/** A U of T course code — mirrors isCourseCode in lib/faculties.ts. */
const STEM = /^[A-Z]{3}(?:\d{3}|[A-D]\d{2})$/

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
