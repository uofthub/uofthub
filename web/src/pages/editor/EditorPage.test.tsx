import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryRouter, Link, Route, RouterProvider, Routes } from 'react-router-dom'
import { api, type CourseTemplate, type ProjectDetail } from '../../lib/api'
import EditorPage from './EditorPage'

const me = { id: 'me', name: 'Aisha Khan', email: 'aisha@mail.utoronto.ca' }
vi.mock('../../lib/auth', () => ({ useAuth: () => ({ user: me }) }))
// jsdom has no canvas: a thumbnail is whatever the image was.
vi.mock('../../lib/thumbnails', () => ({
  makeThumbnail: async (file: File) => file,
  thumbnailSource: () => null,
}))

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

// A data router, as in main.tsx: the editor's guard against leaving with
// unsaved work needs one.
function open(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <>
            <Link to="/elsewhere">Go elsewhere</Link>
            <Routes>
              <Route path="/projects/new" element={<EditorPage />} />
              <Route path="/projects/:id/edit" element={<EditorPage />} />
              <Route path="/projects/:id" element={<p>Project page</p>} />
              <Route path="/elsewhere" element={<p>Somewhere else</p>} />
            </Routes>
          </>
        ),
      },
    ],
    { initialEntries: [path] }
  )
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
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
    const types = within(screen.getByRole('group', { name: 'Project type' }))
    expect(types.getAllByRole('button').length).toBeGreaterThan(0)
    expect(types.queryAllByRole('button', { pressed: true })).toEqual([])
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

describe('a link output', () => {
  it('can take the preview image its page advertises as its thumbnail', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
    const importLink = vi.spyOn(api.projects, 'importLink').mockResolvedValue({
      url: 'https://youtu.be/x',
      tags: [],
      details: [],
      links: [],
      ai: false,
      image: { name: 'cover.png', contentType: 'image/png', dataBase64: btoa('png') },
    })
    open('/projects/new')
    fireEvent.change(await screen.findByLabelText('Link to add as an output'), {
      target: { value: 'https://youtu.be/x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
    // Offered, not done unasked.
    expect(importLink).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use the link’s preview image' }))

    expect(await screen.findByRole('button', { name: 'Remove thumbnail' })).toBeTruthy()
    expect(importLink).toHaveBeenCalledWith('https://youtu.be/x', { fill: false })
    expect(screen.queryByRole('button', { name: 'Use the link’s preview image' })).toBeNull()
  })
})

describe('leaving the editor', () => {
  it('goes straight away with nothing changed', async () => {
    open('/projects/new')
    await screen.findByText('What are you sharing?')
    fireEvent.click(screen.getByText('Go elsewhere'))
    expect(await screen.findByText('Somewhere else')).toBeTruthy()
  })

  it('asks first with unsaved changes, and stays when told to', async () => {
    open('/projects/new')
    fireEvent.change(await screen.findByPlaceholderText('Give it a short, specific name'), {
      target: { value: 'A long CSC211 write-up' },
    })
    fireEvent.click(screen.getByText('Go elsewhere'))
    expect(await screen.findByText('Leave without saving?')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }))
    expect(screen.getByDisplayValue('A long CSC211 write-up')).toBeTruthy()

    fireEvent.click(screen.getByText('Go elsewhere'))
    fireEvent.click(await screen.findByRole('button', { name: 'Leave' }))
    expect(await screen.findByText('Somewhere else')).toBeTruthy()
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
    canEdit: true,
  } as unknown as ProjectDetail

  it('loads what the project already says', async () => {
    vi.spyOn(api.projects, 'get').mockResolvedValue(project)
    open('/projects/p1/edit')
    expect(await screen.findByDisplayValue('Mussels downstream')).toBeTruthy()
    expect(screen.getByDisplayValue('Fewer mussels.')).toBeTruthy()
  })

  it('removes a file already on the project when saved, not before', async () => {
    vi.spyOn(api.projects, 'get').mockResolvedValue({
      ...project,
      files: [{ id: 'f1', name: 'old-draft.pdf', sizeBytes: 2048, uploadedAt: '' }],
    })
    vi.spyOn(api.projects, 'update').mockResolvedValue({ id: 'p1', outputs: [] } as never)
    const deleteFile = vi.spyOn(api.projects, 'deleteFile').mockResolvedValue({ ok: true })
    open('/projects/p1/edit')
    fireEvent.click(await screen.findByRole('button', { name: 'Remove old-draft.pdf' }))
    expect(screen.queryByText('old-draft.pdf')).toBeNull()
    expect(screen.getByText(/will be deleted when you save/)).toBeTruthy()
    expect(deleteFile).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Project page')).toBeTruthy()
    expect(deleteFile).toHaveBeenCalledWith('p1', 'f1')
  })

  it('is closed to anyone who is not one of its makers', async () => {
    vi.spyOn(api.projects, 'get').mockResolvedValue({
      ...project,
      ownerId: 'someone-else',
      canEdit: false,
    })
    open('/projects/p1/edit')
    expect(
      await screen.findByText('Only the project’s owner and collaborators can edit it')
    ).toBeTruthy()
  })

  it('lets a collaborator edit, without the choice of who sees it', async () => {
    vi.spyOn(api.projects, 'get').mockResolvedValue({ ...project, ownerId: 'someone-else' })
    open('/projects/p1/edit')
    expect(await screen.findByDisplayValue('Mussels downstream')).toBeTruthy()
    expect(screen.queryByText('Who can see this?')).toBeNull()
  })
})
