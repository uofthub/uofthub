import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConfirmHost } from './Confirm'
import { confirmAction } from './confirmStore'
import { Dialog } from './Dialog'
import { Toaster } from './Toast'
import { toast } from './toastStore'

describe('confirmAction', () => {
  it('resolves true when the student goes ahead', async () => {
    render(<ConfirmHost />)
    let answer: Promise<boolean>
    act(() => {
      answer = confirmAction({ title: 'Delete this?', confirmLabel: 'Delete', danger: true })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await expect(answer!).resolves.toBe(true)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  it('resolves false on Cancel', async () => {
    render(<ConfirmHost />)
    let answer: Promise<boolean>
    act(() => {
      answer = confirmAction({ title: 'Leave?', confirmLabel: 'Leave' })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await expect(answer!).resolves.toBe(false)
  })

  it('takes Escape for itself, leaving the dialog it was opened from open', async () => {
    const onClose = vi.fn()
    render(
      <>
        <Dialog title="Version" onClose={onClose}>
          body
        </Dialog>
        <ConfirmHost />
      </>
    )
    let answer: Promise<boolean>
    act(() => {
      answer = confirmAction({ title: 'Restore?', confirmLabel: 'Restore' })
    })
    fireEvent.keyDown(document, { key: 'Escape' })
    await expect(answer!).resolves.toBe(false)
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('toast', () => {
  it('shows the same line once, and runs its action', () => {
    const undo = vi.fn()
    render(<Toaster />)
    act(() => {
      toast('Link copied.')
      toast('Link copied.')
    })
    expect(screen.getAllByText('Link copied.')).toHaveLength(1)

    act(() => {
      toast('Blocked Sam.', { action: { label: 'Undo', onClick: undo } })
    })
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledOnce()
  })
})

describe('Dialog without onClose', () => {
  it('cannot be closed: no close button, and Escape does nothing', () => {
    render(<Dialog title="Agree to our Terms">body</Dialog>)
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})
