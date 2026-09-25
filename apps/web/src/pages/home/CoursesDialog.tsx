import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useAuth } from '../../lib/auth'
import { isCourseCode } from '../../lib/projectView'
import { Button, ChipInput, Dialog, ErrorText, Field } from '../../components/ui'

/** Mirrors COURSES_MAX in apps/api/src/lib/profile.ts. */
const COURSES_MAX = 12

/**
 * The courses a student takes. They shape the home feed the way a course tag
 * on their own work does, so a first-year with nothing published still gets
 * a feed about their courses.
 */
export function CoursesDialog({ onClose }: { onClose: () => void }) {
  const { user, refetch } = useAuth()
  const qc = useQueryClient()
  const [courses, setCourses] = useState<string[]>(user?.courses ?? [])

  const save = useMutation({
    mutationFn: () => api.users.updateMe({ courses }),
    onSuccess: () => {
      refetch()
      qc.invalidateQueries({ queryKey: ['feed'] })
      qc.invalidateQueries({ queryKey: ['profile', user?.id] })
      onClose()
    },
  })

  return (
    <Dialog
      title="Your courses"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </>
      }
    >
      <Field
        label="Course codes"
        hint="Like CSC343 or MAT137Y1. Press Enter after each. Your home feed leans towards them."
      >
        <ChipInput
          label="Course codes"
          value={courses}
          onChange={setCourses}
          max={COURSES_MAX}
          maxLength={10}
          placeholder="CSC343"
          normalize={(raw) => {
            const code = raw.replace(/\s+/g, '').toUpperCase()
            return isCourseCode(code) ? code : null
          }}
        />
      </Field>
      {save.isError && <ErrorText>{(save.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
