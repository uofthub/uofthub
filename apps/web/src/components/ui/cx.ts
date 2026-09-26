import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * tailwind-merge only knows Tailwind's stock scales, so it has to be told
 * about index.css's @theme: without this it reads `text-15` as a colour and
 * `text-15 text-ink` would lose one of the two.
 */
const merge = extendTailwindMerge({
  // Stock text-* sizes carry a line-height, so by default a later text-* drops
  // an earlier leading-*. index.css's sizes carry none; keep both.
  override: {
    conflictingClassGroups: { 'font-size': [] },
  },
  extend: {
    theme: {
      text: [
        '11',
        '12',
        '13',
        '14',
        '15',
        '16',
        '17',
        '18',
        '19',
        '20',
        '21',
        '22',
        '23',
        '24',
        '26',
        '28',
        '30',
        '32',
        '36',
        '40',
        '44',
        '52',
        '54',
      ],
      tracking: ['tightest', 'tighter', 'tight', 'wide', 'wider'],
      radius: ['card', 'btn'],
      shadow: ['pop', 'raised', 'float'],
      animate: ['page-in', 'tab-in', 'fade-in', 'pop-in', 'menu-in', 'rise-in'],
      breakpoint: ['sm', 'md', 'lg', 'xl', '2xl'],
    },
  },
})

/**
 * Joins class names, dropping the falsy ones, and lets a later Tailwind class
 * win over an earlier one it conflicts with — so a component's defaults can be
 * overridden by the `className` it is handed.
 */
export const cx = (...parts: ClassValue[]) => merge(clsx(parts))
