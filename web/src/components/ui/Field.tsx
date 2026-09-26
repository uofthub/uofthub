import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { buttonClass } from './buttonClass'
import { cx } from './cx'
import { Icon, type IconName } from './Icon'

/** A labelled control: label above, hint below. */
export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode
  hint?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cx('flex flex-col gap-1.5 text-14 font-semibold', className)}>
      {label}
      {children}
      {hint && <FieldHint>{hint}</FieldHint>}
    </label>
  )
}

/** Two or three fields side by side, sharing the width and wrapping when narrow. */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-4 *:grow">{children}</div>
}

/** The quiet line under a control that says what goes in it. */
export function FieldHint({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx('text-13 font-normal text-muted', className)}>{children}</span>
}

/** The text box look, shared by Input, TextArea, Select and ChipInput's frame. */
export const inputClass =
  'h-11 w-full rounded-btn border border-line-strong bg-surface px-3.5 text-15 font-normal text-ink placeholder:text-placeholder focus:border-navy-ink focus:outline-2 focus:outline-offset-0 focus:outline-navy-soft'

export function Input({
  className,
  inputRef,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { inputRef?: Ref<HTMLInputElement> }) {
  return <input ref={inputRef} className={cx(inputClass, className)} {...rest} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(inputClass, 'h-auto min-h-24 resize-y py-3 leading-normal', className)}
      {...rest}
    />
  )
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputClass, 'select-chevron pr-9.5', className)} {...rest}>
      {children}
    </select>
  )
}

/**
 * The outlined frame of a search bar — an icon and a bare input inside it,
 * lit navy while the input has focus. Height, radius and padding are the
 * caller's: Explore's is a tall rounded box, the landing hero's a pill.
 */
export const searchFrame =
  'flex items-center border border-line-strong bg-surface text-muted focus-within:border-navy-ink focus-within:outline-2 focus-within:outline-navy-soft'

/** The bare input inside a searchFrame. */
export const searchInput = 'min-w-0 flex-1 bg-transparent text-ink outline-none'

/**
 * A file picker drawn as a dashed drop area: an icon, what to add, and a
 * "Browse files" button. The whole area is the <label>, so pass the (visually
 * hidden) file input as the child and a click anywhere opens it.
 */
export function Dropzone({
  icon,
  title,
  hint,
  children,
}: {
  icon: IconName
  title: ReactNode
  hint: ReactNode
  children: ReactNode
}) {
  return (
    <label className="flex cursor-pointer flex-wrap items-center gap-3.5 rounded-xl border-[1.5px] border-dashed border-line-dashed bg-fill-warm p-4.5">
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy-tint text-navy-ink">
        <Icon name={icon} size={20} />
      </span>
      <span className="min-w-0 grow">
        <span className="block text-15 font-semibold">{title}</span>
        <span className="text-13 text-muted">{hint}</span>
      </span>
      <span className={buttonClass({ size: 'md' })}>Browse files</span>
      {children}
    </label>
  )
}
