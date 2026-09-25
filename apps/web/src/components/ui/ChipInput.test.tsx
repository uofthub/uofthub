import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ChipInput } from './ChipInput'

const setup = (value: string[], normalize?: (s: string) => string | null, max = 6) => {
  const onChange = vi.fn()
  render(
    <ChipInput label="Courses" value={value} onChange={onChange} max={max} normalize={normalize} />
  )
  return { onChange, box: screen.queryByLabelText('Courses') as HTMLInputElement | null }
}

describe('ChipInput', () => {
  it('adds what is typed on Enter, shaped by normalize, without duplicates', () => {
    const { onChange, box } = setup(['CSC343'], (s) => s.toUpperCase())
    fireEvent.change(box!, { target: { value: 'mat137' } })
    fireEvent.keyDown(box!, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(['CSC343', 'MAT137'])

    onChange.mockClear()
    fireEvent.change(box!, { target: { value: 'csc343' } })
    fireEvent.keyDown(box!, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('refuses what normalize rejects, and removes an item by its button', () => {
    const { onChange, box } = setup(['CSC343'], () => null)
    fireEvent.change(box!, { target: { value: 'Robotics' } })
    fireEvent.keyDown(box!, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Remove CSC343' }))
    expect(onChange).toHaveBeenLastCalledWith([])
  })

  it('hides the box once the list is full', () => {
    const { box } = setup(['A', 'B'], undefined, 2)
    expect(box).toBeNull()
  })
})
