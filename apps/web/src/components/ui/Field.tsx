import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { cx } from './cx'

/** A labelled control: the design's `.field` — label above, hint below. */
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
    <label className={cx('field', className)}>
      {label}
      {children}
      {hint && <span className="field__hint">{hint}</span>}
    </label>
  )
}

export function Input({
  className,
  inputRef,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { inputRef?: Ref<HTMLInputElement> }) {
  return <input ref={inputRef} className={cx('inp', className)} {...rest} />
}

export function TextArea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('inp', className)} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx('inp', className)} {...rest}>
      {children}
    </select>
  )
}
