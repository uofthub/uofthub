import type { IconName } from '../components/ui/Icon'

/**
 * The faculties and divisions a profile can name — U of T's own list of
 * faculties and academic units, mirrored from api/src/lib/faculties.ts
 * (change both together). The profile form picks from it, and Explore's tiles, the faculty filter and the "Your
 * program" feed all match on it exactly.
 *
 * `short` is the tile label where the full name would wrap badly; the icon and
 * tints follow the Explore board.
 */
export type Faculty = { name: string; short: string; icon: IconName; bg: string; ink: string }

export const FACULTIES: Faculty[] = [
  {
    name: 'Applied Science & Engineering',
    short: 'Engineering',
    icon: 'chip',
    bg: '#E4EAEC',
    ink: '#2F4650',
  },
  {
    name: 'Architecture, Landscape & Design',
    short: 'Architecture, Daniels',
    icon: 'palette',
    bg: '#F3E8F4',
    ink: '#6B2A70',
  },
  {
    name: 'Arts & Science',
    short: 'Arts & Science',
    icon: 'layers',
    bg: '#E6EBF4',
    ink: '#1E3765',
  },
  {
    name: 'Continuing Studies',
    short: 'Continuing Studies',
    icon: 'calendar',
    bg: '#EFEDE6',
    ink: '#4A4538',
  },
  { name: 'Dentistry', short: 'Dentistry', icon: 'shieldCheck', bg: '#E4EAEC', ink: '#2F4650' },
  { name: 'Education', short: 'Education, OISE', icon: 'bulb', bg: '#FBEFD0', ink: '#6B4B00' },
  { name: 'Information', short: 'Information', icon: 'globe', bg: '#E6EBF4', ink: '#1E3765' },
  {
    name: 'Kinesiology & Physical Education',
    short: 'Kinesiology',
    icon: 'compass',
    bg: '#E3EEE6',
    ink: '#1F5B34',
  },
  { name: 'Law', short: 'Law', icon: 'file', bg: '#EFEDE6', ink: '#4A4538' },
  { name: 'Management', short: 'Management, Rotman', icon: 'grid', bg: '#EFEDE6', ink: '#4A4538' },
  { name: 'Medicine', short: 'Medicine', icon: 'flask', bg: '#F6E7E1', ink: '#8A3B12' },
  { name: 'Music', short: 'Music', icon: 'music', bg: '#FBEFD0', ink: '#6B4B00' },
  { name: 'Nursing', short: 'Nursing', icon: 'users', bg: '#F6E7E1', ink: '#8A3B12' },
  { name: 'Pharmacy', short: 'Pharmacy', icon: 'flask', bg: '#E3EEE6', ink: '#1F5B34' },
  { name: 'Public Health', short: 'Public Health', icon: 'chart', bg: '#E3EEE6', ink: '#1F5B34' },
  { name: 'Social Work', short: 'Social Work', icon: 'users', bg: '#F3E8F4', ink: '#6B2A70' },
  {
    name: 'University of Toronto Mississauga',
    short: 'UTM',
    icon: 'mapPin',
    bg: '#E6EBF4',
    ink: '#1E3765',
  },
  {
    name: 'University of Toronto Scarborough',
    short: 'UTSC',
    icon: 'mapPin',
    bg: '#E4EAEC',
    ink: '#2F4650',
  },
]

export const facultyByName = (name: string) =>
  FACULTIES.find((f) => f.name.toLowerCase() === name.toLowerCase())
