import { toast } from '../components/ui'

/** Copies a link and says whether it worked — the copy itself is invisible. */
export function copyLink(url: string) {
  if (!navigator.clipboard) return toast.error('Couldn’t copy the link from this browser.')
  navigator.clipboard.writeText(url).then(
    () => toast('Link copied.'),
    () => toast.error('Couldn’t copy the link.')
  )
}
