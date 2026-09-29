/**
 * Fills a local database with a believable community to click around in:
 * eighteen students across the faculties and all three campuses, their
 * projects, updates, comments, reactions, follows, saves, collections, two
 * groups, messages and the notifications all of that produces.
 *
 *   pnpm --filter @uofthub/api seed:demo
 *
 * Every account signs in with its email and the password 12345678. That is
 * shorter than the app lets anyone choose (MIN_PASSWORD_LENGTH), which is
 * fine for mock accounts that never leave a laptop and is why the hash is
 * written here rather than through /auth/register.
 *
 * Run it again whenever: it deletes the previous run's accounts and groups
 * first. Everything else goes through the real routes (app.inject), so the
 * notifications, update timelines and counts are exactly what the app makes;
 * the timestamps are then spread over the last few weeks so the feeds read
 * like a term in progress rather than one busy second.
 *
 * Local databases only. Email and OpenAI are switched off for the run, so no
 * mail goes to the (real) mail.utoronto.ca domain these addresses are on.
 */
if (process.env.NODE_ENV === 'production') {
  console.error('Refusing to seed in production.')
  process.exit(1)
}
// Quiet: no request log for the ~1,000 calls below, and no "email disabled"
// warning for each notification.
process.env.NODE_ENV = 'test'
delete process.env.RESEND_API_KEY
delete process.env.OPENAI_API_KEY

import type { Campus, ProjectStatus, ProjectType, ReactionKind, Visibility } from '@prisma/client'
import type { ProjectSection } from '@uofthub/types'
import { buildApp } from '../app.js'
import { db } from '../db/client.js'
import { hashPassword } from '../lib/password.js'
import { roleFor } from '../lib/session.js'

const PASSWORD = '12345678'
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

const dbHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? '').hostname
  } catch {
    return ''
  }
})()
if (!['localhost', '127.0.0.1', '::1'].includes(dbHost) && !process.argv.includes('--force')) {
  console.error(`Refusing to seed ${dbHost || 'an unknown database'}: local databases only.`)
  process.exit(1)
}

/** A seeded random — the same people react to the same projects every run. */
let state = 20260928
const rand = () => {
  state = (state + 0x6d2b79f5) | 0
  let t = Math.imul(state ^ (state >>> 15), 1 | state)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
const pick = <T>(xs: T[], n: number) => [...xs].sort(() => rand() - 0.5).slice(0, n)

// ─── People ────────────────────────────────────────────────────────────────

type Person = {
  key: string
  name: string
  faculty: string | null
  campus: Campus | null
  program: string | null
  classYear: number | null
  courses: string[]
  bio: string
  openTo: string[]
  isAdmin?: boolean
}

const PEOPLE: Person[] = [
  {
    key: 'maya',
    name: 'Maya Chen',
    faculty: 'Arts & Science',
    campus: 'UTSG',
    program: 'Computer Science Specialist',
    classYear: 2027,
    courses: ['CSC309H1', 'CSC343H1', 'CSC369H1'],
    bio: 'Third-year CS. I build small tools that make campus life less annoying. Moderator here.',
    openTo: ['Collaboration', 'Summer 2027 internships'],
    isAdmin: true,
  },
  {
    key: 'arjun',
    name: 'Arjun Patel',
    faculty: 'Applied Science & Engineering',
    campus: 'UTSG',
    program: 'Engineering Science (Robotics)',
    classYear: 2026,
    courses: ['ROB301H1', 'ECE345H1', 'ESC190H1'],
    bio: 'Robotics option. If it has a motor and a microcontroller I want to take it apart.',
    openTo: ['Hardware collaborators', 'Research positions'],
  },
  {
    key: 'sofia',
    name: 'Sofia Rossi',
    faculty: 'Architecture, Landscape & Design',
    campus: 'UTSG',
    program: 'Architectural Studies',
    classYear: 2027,
    courses: ['ARC200H1', 'ARC201H1'],
    bio: 'Interested in adaptive reuse and what old buildings can still become.',
    openTo: ['Design critiques'],
  },
  {
    key: 'daniel',
    name: 'Daniel Kim',
    faculty: 'Management',
    campus: 'UTSG',
    program: 'Rotman Commerce (Finance & Economics)',
    classYear: 2026,
    courses: ['RSM230H1', 'RSM332H1', 'ECO200Y1'],
    bio: 'Finance student who likes spreadsheets a little too much.',
    openTo: ['Case competitions'],
  },
  {
    key: 'aisha',
    name: 'Aisha Mohammed',
    faculty: 'University of Toronto Mississauga',
    campus: 'UTM',
    program: 'Computer Science',
    classYear: 2027,
    courses: ['CSC207H5', 'CSC236H5', 'MAT223H5'],
    bio: 'UTM CS. Commuter, so most of my projects are about getting places faster.',
    openTo: ['Collaboration', 'Hackathon teams'],
  },
  {
    key: 'liam',
    name: "Liam O'Connor",
    faculty: 'Music',
    campus: 'UTSG',
    program: 'Composition',
    classYear: 2028,
    courses: ['MUS200H1', 'TMU220H1'],
    bio: 'Composer. Strings, film music, and field recordings of the TTC.',
    openTo: ['Film scoring', 'Performers for readings'],
  },
  {
    key: 'priya',
    name: 'Priya Sharma',
    faculty: 'Nursing',
    campus: 'UTSG',
    program: 'Bachelor of Science in Nursing',
    classYear: 2026,
    courses: [],
    bio: 'Final-year nursing. Research interest: shift work and clinician wellbeing.',
    openTo: ['Survey participants'],
  },
  {
    key: 'ethan',
    name: 'Ethan Wong',
    faculty: 'University of Toronto Scarborough',
    campus: 'UTSC',
    program: 'Computer Science Co-op',
    classYear: 2028,
    courses: ['CSCA48H3', 'CSCB07H3', 'MATA37H3'],
    bio: 'Second-year at UTSC. Games, Android apps, and cheap food.',
    openTo: ['Collaboration'],
  },
  {
    key: 'chloe',
    name: 'Chloe Martin',
    faculty: 'Information',
    campus: 'UTSG',
    program: 'Master of Information (UX Design)',
    classYear: 2026,
    courses: [],
    bio: 'UX researcher. Accessibility first, pretty second.',
    openTo: ['Usability testing', 'UX internships'],
  },
  {
    key: 'omar',
    name: 'Omar Haddad',
    faculty: 'Kinesiology & Physical Education',
    campus: 'UTSG',
    program: 'Kinesiology',
    classYear: 2027,
    courses: ['KPE260H1'],
    bio: 'Varsity track and a lab assistant in biomechanics.',
    openTo: ['Research positions'],
  },
  {
    key: 'grace',
    name: 'Grace Liu',
    faculty: 'Public Health',
    campus: 'UTSG',
    program: 'MPH Epidemiology',
    classYear: 2026,
    courses: [],
    bio: 'Epidemiology student mapping how heat and housing shape health in Toronto.',
    openTo: ['Data collaborators'],
  },
  {
    key: 'noah',
    name: 'Noah Singh',
    faculty: 'Applied Science & Engineering',
    campus: 'UTSG',
    program: 'Mechanical Engineering',
    classYear: 2027,
    courses: ['MIE243H1', 'MIE221H1'],
    bio: 'Formula SAE aero sub-team. CAD by day, CFD by night.',
    openTo: ['Collaboration'],
  },
  {
    key: 'hannah',
    name: 'Hannah Nguyen',
    faculty: 'University of Toronto Mississauga',
    campus: 'UTM',
    program: 'Psychology',
    classYear: 2027,
    courses: ['PSY100H5', 'PSY201H5', 'STA220H5'],
    bio: 'Psych student at UTM, curious about sleep and memory.',
    openTo: ['Study participants'],
  },
  {
    key: 'lucas',
    name: 'Lucas Fernandes',
    faculty: 'University of Toronto Scarborough',
    campus: 'UTSC',
    program: 'Economics for Management Studies',
    classYear: 2026,
    courses: ['MGEB02H3', 'MGEB12H3'],
    bio: 'Economics at UTSC. I like turning messy costs into one clear number.',
    openTo: ['Collaboration'],
  },
  {
    key: 'zara',
    name: 'Zara Ahmed',
    faculty: 'Law',
    campus: 'UTSG',
    // No program: the name line falls back to the campus.
    program: null,
    classYear: 2026,
    courses: [],
    bio: 'JD candidate. Housing law and legal clinics.',
    openTo: [],
  },
  {
    key: 'ben',
    name: 'Ben Carter',
    faculty: 'Arts & Science',
    // Neither program nor campus: the name line is empty.
    campus: null,
    program: null,
    classYear: null,
    courses: [],
    bio: 'Photographer. Walking the city with a 35mm.',
    openTo: [],
  },
  {
    key: 'mei',
    name: 'Mei Tanaka',
    faculty: 'Pharmacy',
    campus: 'UTSG',
    program: 'PharmD',
    classYear: 2027,
    courses: ['PHM140H1'],
    bio: 'PharmD student building study tools for my cohort.',
    openTo: ['Collaboration'],
  },
  {
    key: 'jordan',
    name: 'Jordan Lee',
    faculty: 'Education',
    campus: 'UTSG',
    program: 'Master of Teaching',
    classYear: 2026,
    courses: [],
    bio: 'Future high-school math teacher. Making math feel less scary.',
    openTo: ['Classroom collaborators'],
  },
]

const emailOf = (p: Person) =>
  `${p.name
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/ /g, '.')}@mail.utoronto.ca`
const handleOf = (p: Person) =>
  p.name
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .replace(/ /g, '-')

// ─── Projects ──────────────────────────────────────────────────────────────

type Thread = { by: string; body: string; replies?: { by: string; body: string }[] }

type ProjectSeed = {
  key: string
  owner: string
  title: string
  pitch: string
  description: string
  type: ProjectType
  status: ProjectStatus
  visibility?: Visibility
  tags: string[]
  courseCode?: string
  helpNeeded?: string
  sections?: ProjectSection[]
  details?: { label: string; value: string }[]
  links?: { label: string; url: string }[]
  /** How long ago it was published. */
  daysAgo: number
  /** Posted after publishing, oldest first. */
  updates?: string[]
  comments?: Thread[]
  collaborators?: { who: string; title: string; accepted: boolean }[]
}

const PROJECTS: ProjectSeed[] = [
  {
    key: 'studyspot',
    owner: 'maya',
    title: 'StudySpot',
    pitch: 'Find a free seat in a St. George library before you walk there.',
    description:
      'StudySpot shows live seat availability across Robarts, Gerstein and the Engineering library, crowd-sourced from students checking in. Built for CSC309 and kept running after the course ended.',
    type: 'APP',
    status: 'IN_PROGRESS',
    tags: ['web', 'react', 'libraries', 'CSC309'],
    courseCode: 'CSC309H1',
    sections: [
      {
        id: 'why',
        kind: 'motivation',
        body: 'Every exam season I walked to three libraries before finding a seat. The data exists in people’s heads; it just is not shared.',
      },
      {
        id: 'how',
        kind: 'method',
        body: 'A React front end and a small Node API. Students check in and out; a seat count decays back to “unknown” after two hours without check-ins.',
      },
      {
        id: 'results',
        kind: 'results',
        body: '400 check-ins in the first two weeks of April. Median time to find a seat dropped from ~18 minutes to ~6 among regular users.',
      },
    ],
    details: [
      { label: 'Stack', value: 'React, Node, Postgres' },
      { label: 'Team size', value: '2' },
    ],
    links: [{ label: 'Live demo', url: 'https://example.com/studyspot' }],
    daysAgo: 24,
    updates: [
      'Added Gerstein Library and a quiet-floors filter',
      'Check-ins now expire after two hours so stale counts disappear',
      'Dark mode, finally',
    ],
    collaborators: [{ who: 'chloe', title: 'UX research', accepted: true }],
    comments: [
      {
        by: 'aisha',
        body: 'Any chance of a UTM version? The library here is packed from October onwards.',
        replies: [
          {
            by: 'maya',
            body: 'Yes! If you can get me the floor list I can add UTM next week.',
          },
          { by: 'aisha', body: 'Deal, sending it over in DMs.' },
        ],
      },
      {
        by: 'chloe',
        body: 'The quiet-floors filter tested really well — 7 of 8 participants found it without help.',
      },
      {
        by: 'ethan',
        body: 'How do you stop people from spamming fake check-ins?',
        replies: [
          {
            by: 'maya',
            body: 'Rate limit per account plus the two-hour decay. Not perfect but nobody has tried hard yet.',
          },
        ],
      },
    ],
  },
  {
    key: 'coursemap',
    owner: 'maya',
    title: 'CSC Course Prerequisite Map',
    pitch: 'An interactive graph of every CSC course and what it unlocks.',
    description:
      'Paste in the courses you have taken and see what you can enrol in next, what is one course away, and which paths lead to the 400-level courses you want.',
    type: 'APP',
    status: 'IN_PROGRESS',
    visibility: 'UOFT',
    tags: ['graphs', 'd3', 'course planning'],
    courseCode: 'CSC343H1',
    daysAgo: 9,
    updates: ['Imported the 2026–27 calendar prerequisites'],
    comments: [
      {
        by: 'ethan',
        body: 'Would love this for UTSC codes — CSCA48 → CSCB07 → CSCC01 is a maze.',
      },
    ],
  },
  {
    key: 'draft',
    owner: 'maya',
    title: 'Thesis ideas (draft)',
    pitch: 'Private notes — not published.',
    description: 'Rough ideas for a fourth-year thesis. Only I can see this.',
    type: 'RESEARCH',
    status: 'IN_PROGRESS',
    visibility: 'PRIVATE',
    tags: ['draft'],
    daysAgo: 3,
  },
  {
    key: 'rover',
    owner: 'arjun',
    title: 'Autonomous Line-Following Rover',
    pitch: 'A PID-tuned rover that follows tape at 1.2 m/s without leaving the track.',
    description:
      'Built for ROB301. An IR sensor array feeds a PID controller on an STM32; the tuning process and every failed run are documented.',
    type: 'HARDWARE',
    status: 'SHIPPED',
    tags: ['robotics', 'embedded', 'PID', 'STM32'],
    courseCode: 'ROB301H1',
    sections: [
      {
        id: 'approaches',
        kind: 'approaches',
        title: 'Controllers we tried',
        items: [
          {
            label: 'Bang-bang',
            body: 'Fast to write, oscillated off the track at any real speed.',
          },
          { label: 'P only', body: 'Stable up to 0.6 m/s, overshot on tight curves.' },
          { label: 'PID', body: 'Stable at 1.2 m/s after tuning Kd on the S-bend.' },
        ],
      },
      {
        id: 'reflection',
        kind: 'reflection',
        body: 'Most of the time went into the sensor mount, not the code. Rigid mounting fixed half our “tuning” problems.',
      },
    ],
    details: [
      { label: 'Microcontroller', value: 'STM32F401' },
      { label: 'Top speed', value: '1.2 m/s' },
    ],
    daysAgo: 20,
    updates: [
      'Uploaded the tuning log and final gains',
      'Won best controller in the ROB301 demo day',
    ],
    comments: [
      {
        by: 'noah',
        body: 'That S-bend footage is so satisfying. What did you use for the chassis?',
        replies: [{ by: 'arjun', body: 'Laser-cut 3 mm acrylic from the Myhal makerspace.' }],
      },
      { by: 'omar', body: 'The tuning log is a great read even as a non-engineer.' },
    ],
  },
  {
    key: 'emg',
    owner: 'arjun',
    title: 'Low-Cost EMG Armband',
    pitch: 'Reading forearm muscle signals for under $40 to control a robotic gripper.',
    description:
      'Three surface EMG channels on a 3D-printed band. The signal chain works; classifying gestures reliably does not, yet.',
    type: 'HARDWARE',
    status: 'HELP_WANTED',
    helpNeeded: 'Looking for someone comfortable with signal processing or small ML classifiers.',
    tags: ['EMG', 'biomedical', 'signal processing'],
    daysAgo: 6,
    comments: [
      {
        by: 'omar',
        body: 'Our biomechanics lab has a proper EMG rig — happy to help you get ground-truth recordings.',
        replies: [{ by: 'arjun', body: 'That would be huge, messaging you.' }],
      },
      { by: 'maya', body: 'I took CSC311 last term, could help with the classifier side.' },
    ],
  },
  {
    key: 'honested',
    owner: 'sofia',
    title: 'Adaptive Reuse: Re-imagining a Bloor Street Block',
    pitch: 'What if a closed discount store became a market hall and affordable studios?',
    description:
      'A studio project proposing a mixed-use conversion that keeps the existing structure and signage while adding housing above.',
    type: 'DESIGN',
    status: 'SHIPPED',
    tags: ['architecture', 'adaptive reuse', 'housing'],
    courseCode: 'ARC200H1',
    daysAgo: 18,
    updates: ['Added the final section drawings and model photos'],
    comments: [
      {
        by: 'zara',
        body: 'The ground-floor market idea is lovely. Did zoning come up in crits?',
        replies: [
          {
            by: 'sofia',
            body: 'A lot! The studio brief let us assume a rezoning, but I noted where it would be contested.',
          },
        ],
      },
      { by: 'ben', body: 'I photographed that block last year, the signage deserved saving.' },
    ],
  },
  {
    key: 'pavilion',
    owner: 'sofia',
    title: 'Timber Pavilion Study Models',
    pitch: 'Twelve study models exploring reciprocal timber frames.',
    description: 'Ongoing model-making for a small pavilion on King’s College Circle.',
    type: 'DESIGN',
    status: 'IN_PROGRESS',
    tags: ['timber', 'models', 'pavilion'],
    daysAgo: 4,
  },
  {
    key: 'foodbank',
    owner: 'daniel',
    title: 'Campus Food Bank Demand Forecast',
    pitch: 'Forecasting weekly visits so volunteers can stock the right amount.',
    description:
      'A seasonal model built on two years of anonymized visit counts. Exam weeks and OSAP delays turn out to matter more than weather.',
    type: 'RESEARCH',
    status: 'SHIPPED',
    tags: ['forecasting', 'finance', 'community'],
    courseCode: 'RSM332H1',
    details: [
      { label: 'Method', value: 'SARIMA with holiday regressors' },
      { label: 'Error (MAPE)', value: '11%' },
    ],
    daysAgo: 15,
    updates: ['Shared the model with the food bank volunteers'],
    comments: [
      {
        by: 'grace',
        body: 'Really thoughtful use of administrative data. Did you look at the OSAP delay effect by campus?',
      },
      { by: 'lucas', body: 'The OSAP finding is wild. Would like to see the UTSC numbers too.' },
    ],
  },
  {
    key: 'bustracker',
    owner: 'aisha',
    title: 'UTM Bus Tracker',
    pitch: 'Live arrivals for the 110 and the shuttle, on one screen.',
    description:
      'Combines MiWay’s public feed with the UTM–St. George shuttle schedule so commuters stop checking three apps.',
    type: 'APP',
    status: 'SHIPPED',
    tags: ['transit', 'android', 'UTM', 'CSC207'],
    courseCode: 'CSC207H5',
    links: [{ label: 'Source', url: 'https://example.com/utm-bus-tracker' }],
    daysAgo: 22,
    updates: ['Added the St. George shuttle', 'Home-screen widget'],
    comments: [
      {
        by: 'hannah',
        body: 'I use this every morning. The widget is perfect.',
        replies: [{ by: 'aisha', body: 'This made my week, thank you!' }],
      },
      { by: 'lucas', body: 'Please make one for UTSC and the 95 Express 🙏' },
    ],
  },
  {
    key: 'graphviz',
    owner: 'aisha',
    title: 'Graph Algorithms Visualizer',
    pitch: 'Step through BFS, Dijkstra and Kruskal on graphs you draw yourself.',
    description: 'Made to study for CSC236. Draw a graph, pick an algorithm, and step through it.',
    type: 'APP',
    status: 'IN_PROGRESS',
    tags: ['algorithms', 'education', 'visualization'],
    courseCode: 'CSC236H5',
    daysAgo: 7,
    comments: [{ by: 'jordan', body: 'This would be great in a high-school CS classroom too.' }],
  },
  {
    key: 'quartet',
    owner: 'liam',
    title: 'String Quartet No. 1, “Queen’s Park”',
    pitch: 'Four movements, one for each season on the same bench.',
    description:
      'Premiered at a student composers’ reading in Walter Hall. Recording and score excerpts included.',
    type: 'AUDIO',
    status: 'SHIPPED',
    tags: ['composition', 'strings', 'chamber music'],
    courseCode: 'MUS200H1',
    daysAgo: 16,
    comments: [
      {
        by: 'sofia',
        body: 'The winter movement is beautiful. Very still.',
        replies: [{ by: 'liam', body: 'Thank you — it was written in a snowstorm, fittingly.' }],
      },
    ],
  },
  {
    key: 'filmscore',
    owner: 'liam',
    title: 'Score for “Last Streetcar”',
    pitch: 'An original score for a student short film about the 501 at 3 a.m.',
    description: 'Synths and a solo cello, mixed around recordings from an actual night streetcar.',
    type: 'AUDIO',
    status: 'IN_PROGRESS',
    tags: ['film scoring', 'sound design'],
    daysAgo: 5,
    collaborators: [{ who: 'ethan', title: 'Sound design', accepted: true }],
    updates: ['Rough mix of the opening cue is up'],
  },
  {
    key: 'fatigue',
    owner: 'priya',
    title: 'Night-Shift Fatigue Among Student Nurses',
    pitch: 'A survey of 120 placement students on sleep, errors and coping.',
    description:
      'Preliminary results from a survey run with ethics approval. Looking at how clinical placements on night shifts affect self-reported fatigue.',
    type: 'RESEARCH',
    status: 'IN_PROGRESS',
    tags: ['nursing', 'sleep', 'survey'],
    daysAgo: 12,
    updates: ['Survey closed at 124 responses'],
    comments: [
      {
        by: 'hannah',
        body: 'Would love to compare with our UTM sleep data — different population, similar measures.',
      },
    ],
  },
  {
    key: 'scarbeats',
    owner: 'ethan',
    title: 'Scarborough Eats',
    pitch: 'Every student deal within a 15-minute walk of UTSC.',
    description:
      'A crowd-sourced map of student discounts near UTSC. The Android app works; the deal-submission flow needs a designer.',
    type: 'APP',
    status: 'HELP_WANTED',
    helpNeeded: 'Need a UI/UX designer and someone to help verify deals.',
    tags: ['android', 'food', 'UTSC', 'CSCB07'],
    courseCode: 'CSCB07H3',
    daysAgo: 10,
    collaborators: [{ who: 'lucas', title: 'Deals and pricing', accepted: false }],
    comments: [
      {
        by: 'chloe',
        body: 'I can do a quick heuristic review of the submission flow if you want.',
        replies: [{ by: 'ethan', body: 'Yes please!! Sending you the build.' }],
      },
    ],
  },
  {
    key: 'maze',
    owner: 'ethan',
    title: 'Maze Runner — A* in a Terminal Game',
    pitch: 'A terminal maze game where the monsters use A* to find you.',
    description: 'Made for CSCA48. The monsters get smarter every level.',
    type: 'APP',
    status: 'SHIPPED',
    tags: ['games', 'algorithms', 'C'],
    courseCode: 'CSCA48H3',
    daysAgo: 26,
    comments: [{ by: 'aisha', body: 'The level 5 monsters are genuinely terrifying.' }],
  },
  {
    key: 'wayfinding',
    owner: 'chloe',
    title: 'Accessible Wayfinding for Robarts',
    pitch: 'Redesigning Robarts signage and a companion app with blind and low-vision users.',
    description:
      'A participatory design project with twelve participants. The report covers signage, tactile maps and a screen-reader-first route app.',
    type: 'DESIGN',
    status: 'SHIPPED',
    tags: ['accessibility', 'UX research', 'libraries'],
    sections: [
      {
        id: 'motivation',
        kind: 'motivation',
        body: 'Robarts has 14 floors and two elevator banks that do not stop at the same floors. It is confusing for everyone and inaccessible for many.',
      },
      {
        id: 'considerations',
        kind: 'considerations',
        body: 'Participants were paid and could withdraw at any time. All recordings were deleted after transcription.',
      },
    ],
    daysAgo: 19,
    updates: ['Final report and tactile map files published'],
    collaborators: [{ who: 'maya', title: 'Prototype developer', accepted: true }],
    comments: [
      {
        by: 'jordan',
        body: 'The elevator-bank finding explains so much about my first year.',
      },
      { by: 'grace', body: 'Great consent section — more projects should document this.' },
    ],
  },
  {
    key: 'sprint',
    owner: 'omar',
    title: 'Sprint Start Kinematics in Varsity Athletes',
    pitch: 'High-speed video analysis of 40 block starts.',
    description:
      'Joint angles at set position versus first-step velocity for varsity sprinters, using 240 fps phone video and open-source pose estimation.',
    type: 'RESEARCH',
    status: 'SHIPPED',
    tags: ['biomechanics', 'sport science', 'pose estimation'],
    courseCode: 'KPE260H1',
    daysAgo: 14,
    comments: [
      {
        by: 'arjun',
        body: 'Which pose model did you use? We could use that for the EMG ground truth.',
        replies: [
          {
            by: 'omar',
            body: 'MediaPipe. It struggles with the rear leg, more on that in the notes.',
          },
        ],
      },
    ],
  },
  {
    key: 'heatmap',
    owner: 'grace',
    title: 'Mapping Heat Vulnerability in Toronto',
    pitch: 'Which neighbourhoods are hottest, oldest and least air-conditioned?',
    description:
      'Combines land-surface temperature, census age data and tree canopy into a neighbourhood-level heat vulnerability index.',
    type: 'RESEARCH',
    status: 'SHIPPED',
    tags: ['public health', 'GIS', 'climate', 'open data'],
    details: [
      { label: 'Data', value: 'Landsat 9, 2021 Census, City tree canopy' },
      { label: 'Tools', value: 'R, QGIS' },
    ],
    daysAgo: 11,
    updates: ['Added a map of cooling centres', 'Released the index as a CSV'],
    comments: [
      {
        by: 'daniel',
        body: 'This should be in front of city council. Stunning maps.',
      },
      {
        by: 'sofia',
        body: 'Tree canopy vs. building age is such a useful overlay for design work.',
        replies: [{ by: 'grace', body: 'Please use it! The CSV is up now.' }],
      },
    ],
  },
  {
    key: 'fsae',
    owner: 'noah',
    title: 'Formula SAE Brake Cooling Duct',
    pitch: 'Cutting front rotor temperatures by 60 °C with a printed duct.',
    description: 'CFD-driven duct design for the U of T Formula SAE car, now in track testing.',
    type: 'HARDWARE',
    status: 'IN_PROGRESS',
    tags: ['CFD', 'motorsport', 'CAD'],
    courseCode: 'MIE243H1',
    daysAgo: 8,
    collaborators: [{ who: 'arjun', title: 'Sensors', accepted: true }],
    updates: ['First track test: −48 °C on the front rotors'],
    comments: [{ by: 'arjun', body: 'Thermocouple data is uploaded to the shared drive.' }],
  },
  {
    key: 'sleep',
    owner: 'hannah',
    title: 'Sleep and Exam Performance at UTM',
    pitch: 'Does one extra hour of sleep before an exam matter? (Yes.)',
    description:
      'A small observational study of 86 UTM students pairing sleep diaries with midterm grades.',
    type: 'RESEARCH',
    status: 'SHIPPED',
    tags: ['psychology', 'sleep', 'statistics'],
    courseCode: 'PSY201H5',
    daysAgo: 13,
    comments: [
      {
        by: 'priya',
        body: 'Lovely clean study. Did you control for caffeine?',
        replies: [{ by: 'hannah', body: 'Self-reported only, it is in the limitations.' }],
      },
    ],
  },
  {
    key: 'commute',
    owner: 'lucas',
    title: 'Rent vs. Commute Calculator for UTSC',
    pitch: 'Is living closer worth the rent? One number that answers it.',
    description:
      'Prices your time, TTC fares and rent into a single monthly cost for neighbourhoods around UTSC.',
    type: 'APP',
    status: 'SHIPPED',
    tags: ['economics', 'housing', 'UTSC'],
    courseCode: 'MGEB02H3',
    daysAgo: 17,
    comments: [
      {
        by: 'aisha',
        body: 'Please do UTM next! I would love to show this to my parents.',
      },
    ],
  },
  {
    key: 'tenants',
    owner: 'zara',
    title: 'Plain-Language Tenant Rights Guide',
    pitch: 'The Residential Tenancies Act, explained for students renting for the first time.',
    description:
      'Written with a legal clinic. Covers deposits, rent increases, repairs and what to do before signing.',
    type: 'WRITING',
    status: 'SHIPPED',
    tags: ['law', 'housing', 'students'],
    daysAgo: 21,
    comments: [
      {
        by: 'lucas',
        body: 'Sharing this with every first-year I know.',
      },
      { by: 'sofia', body: 'The section on key-money deposits is so needed.' },
    ],
  },
  {
    key: 'kensington',
    owner: 'ben',
    title: 'Kensington Mornings — A Photo Essay',
    pitch: 'Thirty frames of the market before it opens.',
    description: 'Shot on Portra 400 across one summer, 6–8 a.m.',
    type: 'OTHER',
    status: 'SHIPPED',
    tags: ['photography', 'film', 'Toronto'],
    daysAgo: 9,
    comments: [{ by: 'liam', body: 'These feel like the opening shots of a film.' }],
  },
  {
    key: 'flashcards',
    owner: 'mei',
    title: 'Drug Interaction Flashcards',
    pitch: 'Spaced-repetition cards for the interactions PharmD students actually get asked.',
    description: 'Written by students, reviewed by a TA. Currently 240 cards.',
    type: 'APP',
    status: 'IN_PROGRESS',
    visibility: 'UOFT',
    tags: ['pharmacy', 'study tools', 'spaced repetition'],
    courseCode: 'PHM140H1',
    daysAgo: 6,
    updates: ['Added 60 cards on anticoagulants'],
    comments: [{ by: 'priya', body: 'Nursing students would use this too!' }],
  },
  {
    key: 'mathanxiety',
    owner: 'jordan',
    title: 'Lesson Plans for Grade 9 Math Anxiety',
    pitch: 'Five lessons that start with games and end with algebra.',
    description:
      'Designed and taught during a practicum placement. Includes reflections on what worked and what did not.',
    type: 'WRITING',
    status: 'SHIPPED',
    tags: ['education', 'math', 'teaching'],
    sections: [
      {
        id: 'reflection',
        kind: 'reflection',
        body: 'The card game on day two did more for participation than anything else I tried.',
      },
    ],
    daysAgo: 10,
    comments: [
      { by: 'aisha', body: 'Wish I had had these in grade 9.' },
      { by: 'hannah', body: 'The reflection section is so honest, love it.' },
    ],
  },
]

// ─── Everything else ───────────────────────────────────────────────────────

const COLLECTIONS = [
  {
    owner: 'maya',
    title: 'Best CS projects this term',
    description: 'Projects I keep sending to friends.',
    projects: ['bustracker', 'graphviz', 'maze', 'scarbeats'],
  },
  {
    owner: 'grace',
    title: 'Health research worth reading',
    description: 'Student research on health, sleep and wellbeing.',
    projects: ['fatigue', 'sleep', 'sprint'],
  },
  {
    owner: 'lucas',
    title: 'Housing',
    description: null,
    projects: ['tenants', 'honested', 'commute'],
  },
]

const ORGS = [
  {
    slug: 'campus-robotics-collective',
    name: 'Campus Robotics Collective',
    type: 'CLUB',
    campus: 'UTSG',
    description: 'Build nights every Thursday in Myhal. All skill levels, all faculties.',
    exec: 'arjun',
    members: ['noah', 'omar', 'maya'],
    requests: ['ethan'],
    projects: ['rover', 'emg', 'fsae'],
    activities: [
      { title: 'Build night: intro to soldering', inDays: 3, by: 'arjun' },
      { title: 'Demo day', inDays: 17, by: 'noah' },
    ],
  },
  {
    slug: 'urban-health-data-lab',
    name: 'Urban Health Data Lab',
    type: 'LAB',
    campus: 'UTSG',
    description: 'Students working on open data about health in Toronto neighbourhoods.',
    exec: 'grace',
    members: ['daniel', 'priya', 'hannah'],
    requests: ['lucas'],
    projects: ['heatmap'],
    activities: [{ title: 'Reading group: heat and health', inDays: 6, by: 'grace' }],
  },
] as const

const CONVERSATIONS: { a: string; b: string; lines: [string, string][] }[] = [
  {
    a: 'maya',
    b: 'chloe',
    lines: [
      ['chloe', 'Finished the last two usability sessions for StudySpot!'],
      ['maya', 'Amazing, anything surprising?'],
      ['chloe', 'Everyone looked for the filter at the top, not the bottom sheet.'],
      ['maya', 'Moving it tonight 😅'],
    ],
  },
  {
    a: 'arjun',
    b: 'omar',
    lines: [
      ['arjun', 'Hey! Saw your comment on the EMG armband — when is the lab free?'],
      ['omar', 'Tuesdays after 4. Bring the band and some electrode gel.'],
      ['arjun', 'See you Tuesday.'],
    ],
  },
  {
    a: 'ethan',
    b: 'lucas',
    lines: [
      ['ethan', 'Sent you an invite on Scarborough Eats — want to handle the deals side?'],
      ['lucas', 'Looking at it now, give me a day.'],
    ],
  },
  {
    a: 'aisha',
    b: 'maya',
    lines: [
      ['aisha', 'Here is the UTM library floor list for StudySpot: 1, 2, 3 and the quiet 4th.'],
      ['maya', 'Perfect, thank you!'],
    ],
  },
]

// ─── Running it ────────────────────────────────────────────────────────────

const app = await buildApp()
await app.ready()

type Seeded = { id: string; email: string; sessionVersion: number }
const users = new Map<string, Seeded>()
const projects = new Map<string, string>()

let ip = 0
async function as<T = any>(
  who: string,
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: unknown
): Promise<T> {
  const user = users.get(who)
  if (!user) throw new Error(`No seeded user "${who}"`)
  ip += 1
  const token = app.jwt.sign({
    sub: user.id,
    email: user.email,
    role: roleFor(user.email),
    sv: user.sessionVersion,
  })
  const res = await app.inject({
    method,
    url,
    cookies: { token },
    remoteAddress: `10.9.${(ip >> 8) & 255}.${ip & 255}`,
    ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
  })
  if (res.statusCode >= 400)
    throw new Error(`${who}: ${method} ${url} → ${res.statusCode} ${res.body}`)
  return (res.body ? res.json() : null) as T
}

// 1. Clear the last run. Deleting an account takes its projects, comments,
// reactions, follows and messages with it; groups are not owned by anyone, and
// notifications about seeded people land on real accounts too.
const emails = PEOPLE.map(emailOf)
const previous = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } })
if (previous.length) {
  const ids = previous.map((u) => u.id)
  await db.$executeRawUnsafe(
    `DELETE FROM "Notification" WHERE ${ids.map((_, i) => `payload::text LIKE $${i + 1}`).join(' OR ')}`,
    ...ids.map((id) => `%${id}%`)
  )
  await db.user.deleteMany({ where: { id: { in: ids } } })
}
await db.organization.deleteMany({ where: { slug: { in: ORGS.map((o) => o.slug) } } })
console.log(
  previous.length ? `Removed the previous ${previous.length} demo accounts.` : 'Fresh run.'
)

// 2. People, confirmed, with the shared password.
const passwordHash = await hashPassword(PASSWORD)
for (const p of PEOPLE) {
  const user = await db.user.create({
    data: {
      email: emailOf(p),
      name: p.name,
      handle: handleOf(p),
      passwordHash,
      emailVerifiedAt: new Date(),
      faculty: p.faculty,
      campus: p.campus,
      program: p.program,
      classYear: p.classYear,
      courses: p.courses,
      bio: p.bio,
      openTo: p.openTo,
      isAdmin: p.isAdmin ?? false,
      // Nothing seeded should ever try to email these addresses.
      emailNotifications: false,
      createdAt: new Date(Date.now() - between(35, 60) * DAY),
    },
  })
  users.set(p.key, user)
}
console.log(`Created ${PEOPLE.length} people.`)

// 3. Follows first, so publishing tells followers the way it would for real.
// Everyone follows a handful of people, weighted towards their own campus.
const renfred = await db.user.findUnique({
  where: { email: 'renfred.alonge@mail.utoronto.ca' },
  select: { id: true },
})
for (const p of PEOPLE) {
  const near = PEOPLE.filter((q) => q.key !== p.key && q.campus === p.campus)
  const far = PEOPLE.filter((q) => q.key !== p.key && q.campus !== p.campus)
  for (const q of [...pick(near, between(2, 4)), ...pick(far, between(1, 3))])
    await as(p.key, 'POST', `/users/${users.get(q.key)!.id}/follow`)
}
// A few of them follow the real account on this machine, so its bell has
// something in it too.
if (renfred) {
  for (const key of ['maya', 'aisha', 'ethan', 'grace', 'liam', 'sofia'])
    await as(key, 'POST', `/users/${renfred.id}/follow`)
}

// 4. Projects.
for (const s of PROJECTS) {
  const project = await as<{ id: string }>(s.owner, 'POST', '/projects', {
    title: s.title,
    pitch: s.pitch,
    description: s.description,
    type: s.type,
    status: s.status,
    helpNeeded: s.helpNeeded ?? null,
    tags: s.tags,
    courseCode: s.courseCode ?? null,
    visibility: s.visibility ?? 'PUBLIC',
    sections: s.sections ?? null,
    details: s.details ?? null,
    links: s.links ?? [],
  })
  projects.set(s.key, project.id)
}
console.log(`Created ${PROJECTS.length} projects.`)

// Each owner's newest public project goes on their profile strip.
for (const p of PEOPLE) {
  const mine = PROJECTS.filter((s) => s.owner === p.key && s.visibility !== 'PRIVATE')
  if (mine.length) await as(p.key, 'POST', `/projects/${projects.get(mine[0].key)}/pin`)
}

// 5. Collaborators: invited, and accepted where the seed says so.
for (const s of PROJECTS) {
  for (const c of s.collaborators ?? []) {
    const who = PEOPLE.find((p) => p.key === c.who)!
    await as(s.owner, 'POST', `/projects/${projects.get(s.key)}/collaborators`, {
      email: emailOf(who),
      title: c.title,
    })
    if (c.accepted)
      await as(
        c.who,
        'PATCH',
        `/projects/${projects.get(s.key)}/collaborators/${users.get(c.who)!.id}`,
        {
          accepted: true,
        }
      )
  }
}

// 6. Who follows which project, so the updates below reach someone.
const listed = PROJECTS.filter((s) => s.visibility !== 'PRIVATE')
for (const s of listed) {
  const others = PEOPLE.filter((p) => p.key !== s.owner)
  for (const p of pick(others, between(1, 4)))
    await as(p.key, 'POST', `/projects/${projects.get(s.key)}/follow`)
}

// 7. Updates. StudySpot also ships — a status change is logged on its
// timeline the same way an owner's edit is.
for (const s of PROJECTS) {
  for (const note of s.updates ?? [])
    await as(s.owner, 'POST', `/projects/${projects.get(s.key)}/versions`, { note })
}
await as('maya', 'PATCH', `/projects/${projects.get('studyspot')}`, { status: 'SHIPPED' })

// 8. Reactions (the likes), saves.
const KINDS: ReactionKind[] = ['USEFUL', 'IMPRESSIVE', 'COLLAB']
let reactionCount = 0
for (const s of listed) {
  const others = PEOPLE.filter((p) => p.key !== s.owner)
  for (const p of pick(others, between(3, 11))) {
    for (const kind of pick(KINDS, rand() < 0.25 ? 2 : 1)) {
      // A "want to collaborate" is for work still looking for people.
      if (kind === 'COLLAB' && s.status === 'SHIPPED') continue
      await as(p.key, 'POST', `/projects/${projects.get(s.key)}/reactions`, { kind })
      reactionCount += 1
    }
  }
  for (const p of pick(others, between(0, 4)))
    await as(p.key, 'POST', `/projects/${projects.get(s.key)}/save`)
}
console.log(`Added ${reactionCount} reactions.`)

// 9. Comments, replies, and a few marked helpful.
let commentCount = 0
for (const s of PROJECTS) {
  const id = projects.get(s.key)
  for (const thread of s.comments ?? []) {
    const top = await as<{ id: string }>(thread.by, 'POST', `/projects/${id}/comments`, {
      body: thread.body,
    })
    commentCount += 1
    for (const reply of thread.replies ?? []) {
      await as(reply.by, 'POST', `/projects/${id}/comments`, { body: reply.body, parentId: top.id })
      commentCount += 1
    }
    if (rand() < 0.5 && thread.by !== s.owner)
      await as(s.owner, 'POST', `/projects/${id}/comments/${top.id}/helpful`)
  }
}
console.log(`Added ${commentCount} comments and replies.`)

// 10. Collections.
for (const c of COLLECTIONS) {
  const collection = await as<{ id: string }>(c.owner, 'POST', '/collections', {
    title: c.title,
    ...(c.description ? { description: c.description } : {}),
  })
  for (const key of c.projects)
    await as(c.owner, 'POST', `/collections/${collection.id}/items`, {
      projectId: projects.get(key),
    })
}

// 11. Groups: a moderator (Maya) creates each and hands it to its exec, who
// invites members; some ask to join and wait for an answer.
for (const o of ORGS) {
  const exec = PEOPLE.find((p) => p.key === o.exec)!
  await as('maya', 'POST', '/orgs', {
    name: o.name,
    slug: o.slug,
    type: o.type,
    campus: o.campus,
    description: o.description,
    contactEmail: emailOf(exec),
    contactRole: 'President',
    execEmail: emailOf(exec),
  })
  for (const key of o.members) {
    await as(o.exec, 'POST', `/orgs/${o.slug}/members`, {
      email: emailOf(PEOPLE.find((p) => p.key === key)!),
    })
    await as(key, 'POST', `/orgs/${o.slug}/membership`, { accepted: true })
  }
  for (const key of o.requests) await as(key, 'POST', `/orgs/${o.slug}/join`)
  for (const key of o.projects) {
    const owner = PROJECTS.find((s) => s.key === key)!.owner
    await as(owner, 'POST', `/orgs/${o.slug}/projects`, { projectId: projects.get(key) })
  }
  for (const a of o.activities) {
    await as(a.by, 'POST', `/orgs/${o.slug}/activities`, {
      title: a.title,
      description: 'Open to everyone — just show up.',
      date: new Date(Date.now() + a.inDays * DAY).toISOString(),
    })
  }
}

// 12. Messages, including two to the real account on this machine.
for (const c of CONVERSATIONS) {
  for (const [from, body] of c.lines) {
    const to = from === c.a ? c.b : c.a
    await as(from, 'POST', `/messages/${users.get(to)!.id}`, { body })
  }
}
if (renfred) {
  await as('maya', 'POST', `/messages/${renfred.id}`, {
    body: 'Hey! Welcome to uofthub — let me know if anything looks broken.',
  })
  await as('aisha', 'POST', `/messages/${renfred.id}`, {
    body: 'Hi! Saw your profile. Are you looking for collaborators this term?',
  })
}

// 13. This week's spotlight.
await as('maya', 'POST', '/admin/spotlight', {
  projectId: projects.get('heatmap'),
  note: 'Beautiful maps and an index anyone can reuse.',
})

// 14. Spread it over time. Everything above happened in the last minute; a
// feed where everything is "just now" tests nothing about ordering.
const now = Date.now()
const within = (from: number, to = now) => new Date(from + rand() * (to - from))
const seededIds = [...users.values()].map((u) => u.id)

for (const s of PROJECTS) {
  const id = projects.get(s.key)!
  const base = now - s.daysAgo * DAY - between(0, 10) * HOUR
  const published = s.visibility === 'PRIVATE' ? null : new Date(base)
  await db.project.update({
    where: { id },
    data: {
      createdAt: new Date(base - between(1, 5) * DAY),
      ...(published && { publishedAt: published, announcedAt: published }),
    },
  })

  const versions = await db.projectVersion.findMany({
    where: { projectId: id },
    orderBy: { versionNum: 'asc' },
  })
  for (const [i, v] of versions.entries())
    await db.projectVersion.update({
      where: { id: v.id },
      data: { createdAt: new Date(base + ((i + 1) / (versions.length + 1)) * (now - base)) },
    })

  const comments = await db.comment.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'asc' },
  })
  const at = new Map<string, number>()
  for (const [i, c] of comments.filter((c) => !c.parentId).entries()) {
    const t = base + ((i + 1) / (comments.length + 2)) * (now - base) * 0.8
    at.set(c.id, t)
    await db.comment.update({ where: { id: c.id }, data: { createdAt: new Date(t) } })
  }
  for (const c of comments.filter((c) => c.parentId)) {
    const t = Math.min((at.get(c.parentId!) ?? base) + between(1, 20) * HOUR, now - HOUR)
    at.set(c.parentId!, t)
    await db.comment.update({ where: { id: c.id }, data: { createdAt: new Date(t) } })
  }

  for (const r of await db.projectReaction.findMany({ where: { projectId: id } }))
    await db.projectReaction.update({
      where: { projectId_userId_kind: { projectId: id, userId: r.userId, kind: r.kind } },
      data: { createdAt: within(base) },
    })
  for (const r of await db.projectSave.findMany({ where: { projectId: id } }))
    await db.projectSave.update({
      where: { userId_projectId: { userId: r.userId, projectId: id } },
      data: { createdAt: within(base) },
    })

  // A week of views, so trending has something to rank.
  if (published) {
    let total = 0
    for (let d = 0; d < 7; d++) {
      const date = new Date(now - d * DAY)
      date.setUTCHours(0, 0, 0, 0)
      if (date.getTime() < base - DAY) continue
      const count = between(2, 40)
      total += count
      await db.projectDailyView.upsert({
        where: { projectId_date: { projectId: id, date } },
        create: { projectId: id, date, count },
        update: { count },
      })
    }
    await db.project.update({ where: { id }, data: { viewCount: total + between(20, 300) } })
  }
}

for (const f of await db.follow.findMany({ where: { followerId: { in: seededIds } } }))
  await db.follow.update({
    where: { followerId_followingId: { followerId: f.followerId, followingId: f.followingId } },
    data: { createdAt: new Date(now - between(10, 40) * DAY) },
  })

// Each conversation happened over an afternoon a few days ago.
for (const c of CONVERSATIONS) {
  const [a, b] = [users.get(c.a)!.id, users.get(c.b)!.id]
  const rows = await db.message.findMany({
    where: {
      OR: [
        { senderId: a, recipientId: b },
        { senderId: b, recipientId: a },
      ],
    },
    orderBy: { createdAt: 'asc' },
  })
  let t = now - between(1, 5) * DAY
  for (const m of rows) {
    t += between(2, 90) * 60 * 1000
    await db.message.update({ where: { id: m.id }, data: { createdAt: new Date(t) } })
  }
}

// Notifications keep the order they happened in, over the last four days.
const notes = await db.notification.findMany({
  where: { createdAt: { gte: new Date(now - 30 * 60 * 1000) } },
  orderBy: { createdAt: 'asc' },
  select: { id: true },
})
for (const [i, n] of notes.entries())
  await db.notification.update({
    where: { id: n.id },
    data: { createdAt: new Date(now - 4 * DAY + ((i + 1) / (notes.length + 1)) * 4 * DAY) },
  })

await app.close()

// ─── Summary ───────────────────────────────────────────────────────────────

console.log(`\nDone. Every account's password is ${PASSWORD}\n`)
for (const p of PEOPLE) {
  const owned = PROJECTS.filter((s) => s.owner === p.key).map((s) => s.title)
  console.log(
    `${emailOf(p).padEnd(42)} ${[p.program ?? '—', p.campus ?? '—'].join(', ')}${p.isAdmin ? '  [moderator]' : ''}`
  )
  if (owned.length) console.log(`${''.padEnd(42)} ${owned.join(' · ')}`)
}
await db.$disconnect()
