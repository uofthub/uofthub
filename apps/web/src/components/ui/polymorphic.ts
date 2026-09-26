import type { ComponentPropsWithoutRef, ElementType } from 'react'

/**
 * Props for a component that renders as whatever element — or component, like
 * a router Link — its `as` names, taking that element's own props alongside.
 */
export type AsProps<T extends ElementType, Own = object> = Own & { as?: T } & Omit<
    ComponentPropsWithoutRef<T>,
    keyof Own | 'as'
  >
