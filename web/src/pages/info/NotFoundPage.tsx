import { useDocumentTitle } from '../../lib/hooks'
import { Button, EmptyState, Page } from '../../components/ui'

/** Any address the app has no page for. */
export default function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <Page>
      <EmptyState
        icon="compass"
        title="There’s no page here"
        action={
          <Button variant="primary" to="/explore">
            Explore projects
          </Button>
        }
      >
        The link may be mistyped, or what it pointed at has moved.
      </EmptyState>
    </Page>
  )
}
