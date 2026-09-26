import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { CAMPUS_OPTIONS } from '../../lib/campus'
import {
  Button,
  Dialog,
  ErrorText,
  Field,
  FieldRow,
  Input,
  Select,
  TextArea,
} from '../../components/ui'

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/**
 * A moderator creating a group page. It is published at once — the check that
 * the group is real happens here, before the page exists — and handed to the
 * exec who runs it, who becomes its admin.
 */
export function CreateOrgDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    name: '',
    slug: '',
    type: 'CLUB',
    campus: '',
    description: '',
    websiteUrl: '',
    discordUrl: '',
    groupMeUrl: '',
    execEmail: '',
    contactEmail: '',
    contactRole: '',
  })
  const create = useMutation({
    mutationFn: () =>
      api.orgs.create({
        name: form.name,
        slug: form.slug || slugify(form.name),
        type: form.type,
        campus: form.campus || undefined,
        description: form.description || undefined,
        websiteUrl: form.websiteUrl || undefined,
        discordUrl: form.discordUrl || undefined,
        groupMeUrl: form.groupMeUrl || undefined,
        execEmail: form.execEmail || undefined,
        contactEmail: form.contactEmail || undefined,
        contactRole: form.contactRole || undefined,
      }),
    onSuccess: (org) => {
      qc.invalidateQueries({ queryKey: ['orgs'] })
      onClose()
      navigate(`/orgs/${org.slug}`)
    },
  })
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [k]: e.target.value }))

  return (
    <Dialog
      title="New club or lab"
      onClose={onClose}
      width={620}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => create.mutate()}
            disabled={!form.name.trim() || create.isPending}
          >
            {create.isPending ? 'Creating…' : 'Create and publish'}
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input value={form.name} onChange={set('name')} placeholder="UofT Robotics Association" />
      </Field>
      <Field
        label="Page address"
        hint={`uofthub.com/orgs/${form.slug || slugify(form.name) || '…'}`}
      >
        <Input
          value={form.slug}
          onChange={set('slug')}
          placeholder={slugify(form.name) || 'uoft-robotics'}
        />
      </Field>
      <FieldRow>
        <Field label="Type">
          <Select value={form.type} onChange={set('type')}>
            <option value="CLUB">Club or design team</option>
            <option value="LAB">Research lab</option>
          </Select>
        </Field>
        <Field label="Campus">
          <Select value={form.campus} onChange={set('campus')}>
            <option value="">All three campuses</option>
            {CAMPUS_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      </FieldRow>
      <Field
        label="Exec who runs the page"
        hint="Their uofthub email. They become the group’s admin; leave blank to keep it yourself."
      >
        <Input
          type="email"
          value={form.execEmail}
          onChange={set('execEmail')}
          placeholder="exec@mail.utoronto.ca"
        />
      </Field>
      <Field label="Description">
        <TextArea
          rows={3}
          value={form.description}
          onChange={set('description')}
          placeholder="What does the group do?"
        />
      </Field>
      <Field label="Website">
        <Input value={form.websiteUrl} onChange={set('websiteUrl')} placeholder="https://" />
      </Field>
      <FieldRow>
        <Field label="Discord invite" hint="Optional">
          <Input
            value={form.discordUrl}
            onChange={set('discordUrl')}
            placeholder="https://discord.gg/…"
          />
        </Field>
        <Field label="GroupMe" hint="Optional">
          <Input
            value={form.groupMeUrl}
            onChange={set('groupMeUrl')}
            placeholder="https://groupme.com/join_group/…"
          />
        </Field>
      </FieldRow>
      <FieldRow>
        <Field label="Contact email" hint="Optional — kept to members.">
          <Input
            type="email"
            value={form.contactEmail}
            onChange={set('contactEmail')}
            placeholder="exec@mail.utoronto.ca"
          />
        </Field>
        <Field label="Their role" hint="Optional">
          <Input value={form.contactRole} onChange={set('contactRole')} placeholder="President" />
        </Field>
      </FieldRow>
      {create.isError && <ErrorText>{(create.error as Error).message}</ErrorText>}
    </Dialog>
  )
}
