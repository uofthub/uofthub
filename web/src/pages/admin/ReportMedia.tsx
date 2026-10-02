import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, type ReportMedia as Media } from '../../lib/api'
import { Button, cx, ErrorText, Icon, Spinner } from '../../components/ui'

/** One image, blurred until the moderator chooses to look. */
function Blurred({ media }: { media: Media }) {
  const [shown, setShown] = useState(false)
  return (
    <figure className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="relative block aspect-square overflow-hidden rounded-xl bg-fill"
        aria-label={shown ? `Blur ${media.name}` : `Show ${media.name}`}
      >
        <img
          src={media.url}
          alt={media.name}
          className={cx('size-full object-contain transition', !shown && 'scale-110 blur-2xl')}
        />
        {!shown && (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-13 font-semibold text-ink">
            <Icon name="eye" size={18} /> Click to show
          </span>
        )}
      </button>
      <figcaption className="flex items-center justify-between gap-2 text-12 text-muted">
        <span className="truncate" title={media.name}>
          {media.label}
        </span>
        {shown && (
          <a href={media.url} target="_blank" rel="noreferrer" className="shrink-0 underline">
            Full size
          </a>
        )}
      </figcaption>
    </figure>
  )
}

/**
 * The images and files a report is about, fetched only when a moderator asks
 * — whatever their visibility, including a flagged image the site no longer
 * shows and the copy kept as evidence. Links are signed for five minutes, so
 * they are fetched again rather than kept.
 */
export function ReportMedia({ reportId }: { reportId: string }) {
  const [open, setOpen] = useState(false)
  const media = useQuery({
    queryKey: ['admin-report-media', reportId],
    queryFn: () => api.admin.reportMedia(reportId),
    enabled: open,
    staleTime: 4 * 60 * 1000,
    gcTime: 0,
  })

  if (!open)
    return (
      <Button size="sm" icon="eye" className="self-start" onClick={() => setOpen(true)}>
        Show what was reported
      </Button>
    )
  if (media.isPending) return <Spinner />
  if (media.isError) return <ErrorText>{media.error.message}</ErrorText>
  if (!media.data.length)
    return <p className="text-13 text-muted">No images or files to show for this report.</p>

  const images = media.data.filter((m) => m.kind === 'image')
  const files = media.data.filter((m) => m.kind === 'file')
  return (
    <div className="flex flex-col gap-3">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((m) => (
            <Blurred key={m.url} media={m} />
          ))}
        </div>
      )}
      {files.length > 0 && (
        <ul className="flex flex-col gap-1 text-14">
          {files.map((m) => (
            <li key={m.url} className="flex items-center gap-2">
              <Icon name="file" size={14} className="text-muted" />
              <a href={m.url} className="underline">
                {m.name}
              </a>
              <span className="text-12 text-muted">{m.label}</span>
            </li>
          ))}
        </ul>
      )}
      <Button size="sm" variant="ghost" className="self-start" onClick={() => setOpen(false)}>
        Hide
      </Button>
    </div>
  )
}
