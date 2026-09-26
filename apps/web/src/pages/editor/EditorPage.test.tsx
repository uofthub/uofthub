import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { api, type CourseTemplate, type ProjectDetail } from '../../lib/api'
import EditorPage from './EditorPage'

const me = { id: 'me', name: 'Aisha Khan', email: 'aisha@mail.utoronto.ca' }
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: me }) }))

afterEach(() => vi.restoreAllMocks())

const template: CourseTemplate = {
  code: 'CSC211H5',
  version: 1,
  type: 'RESEARCH',
  intro: 'Compare approaches on one task.',
  primaryOutput: { kind: 'POSTER', prompt: 'Upload your poster as a PDF.', accept: '.pdf' },
  sections: [
    { kind: 'motivation', title: 'Task & motivation', prompt: 'What task, and why?' },
    { kind: 'conclusion', title: 'Recommendation', prompt: 'Which would you pick?' },
  ],
  references: { kinds: ['DATASET', 'PAPER'], prompt: 'Datasets and papers you used.' },
}

function open(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/projects/new" element={<EditorPage />} />
          <Route path="/projects/:id/edit" element={<EditorPage />} />
          <Route path="/projects/:id" element={<p>Project page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('the editor, starting a project', () => {
  it('pre-fills a course’s template when the link names the course', async () => {
    vi.spyOn(api.courses, 'template').mockResolvedValue(template)
    open('/projects/new?course=CSC211H5')
    expect(await screen.findByText('Started from the CSC211H5 template')).toBeTruthy()
    expect(screen.getByText('Task & motivation')).toBeTruthy()
    expect(screen.getByPlaceholderText('What task, and why?')).toBeTruthy()
    expect(screen.getByText('Upload your poster as a PDF.')).toBeTruthy()
    expect((screen.getByPlaceholderText('e.g. CSC211H5') as HTMLInputElement).value).toBe(
      'CSC211H5'
    )
  })

  it('preselects no type, and offers no Draft option beside Publish', async () => {
    open('/projects/new')
    expect(await screen.findByText('What are you sharing?')).toBeTruthy()
    expect(screen.queryAllByRole('button', { pressed: true }).filter((b) => b.className.includes('type-tile'))).toEqual([])
    expect(screen.queryByText('Only you and your collaborators')).toBeNull()
  })

  it('saves a private draft first and makes it visible last', async () => {
    const calls: string[] = []
    vi.spyOn(api.projects, 'create').mockImplementation(async (body) => {
      calls.push(`create:${body.visibility}`)
      return { id: 'p1', outputs: [] } as never
    })
    vi.spyOn(api.projects, 'update').mockImplementation(async (_id, body) => {
      calls.push('visibility' in body ? `update:visibility:${body.visibility}` : 'update:content')
      return { id: 'p1', outputs: [] } as never
    })
    open('/projects/new')
    fireEvent.change(await screen.findByPlaceholderText('Give it a short, specific name'), {
      target: { value: 'Mussels downstream' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText('Project page')).toBeTruthy()
    expect(calls).toEqual(['create:PRIVATE', 'update:content', 'update:visibility:UOFT'])
  })

  it('keeps the draft private and lists what failed', async () => {
    vi.spyOn(api.projects, 'create').mockResolvedValue({ id: 'p1', outputs: [] } as never)
    const update = vi
      .spyOn(api.projects, 'update')
      .mockRejectedValueOnce(new Error('A custom section needs a title'))
    open('/projects/new')
    fireEvent.change(await screen.findByPlaceholderText('Give it a short, specific name'), {
      target: { value: 'Mussels downstream' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }))
    expect(await screen.findByText(/Saved as a private draft/)).toBeTruthy()
    expect(screen.getByText(/A custom section needs a title/)).toBeTruthy()
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
  })
})

describe('the editor, changing a project', () => {
  const project = {
    id: 'p1',
    ownerId: 'me',
    title: 'Mussels downstream',
    tags: [],
    visibility: 'PUBLIC',
    createdAt: '',
    updatedAt: '',
    links: [],
    files: [],
    collaborators: [],
    references: [],
    outputs: [],
    sections: [{ id: 's1', kind: 'results', body: 'Fewer mussels.' }],
  } as unknown as ProjectDetail

  it('loads what the project already says', async () => {
    vi.spyOn(api.projects, 'get').mockResolvedValue(project)
    open('/projects/p1/edit')
    expect(await screen.findByDisplayValue('Mussels downstream')).toBeTruthy()
    expect(screen.getByDisplayValue('Fewer mussels.')).toBeTruthy()
  })

  it('is the owner’s alone', async () => {
    vi.spyOn(api.projects, 'get').mockResolvedValue({ ...project, ownerId: 'someone-else' })
    open('/projects/p1/edit')
    expect(await screen.findByText('Only the project’s owner can edit it')).toBeTruthy()
  })
})
