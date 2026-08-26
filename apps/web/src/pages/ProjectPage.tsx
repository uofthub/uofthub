import { useParams } from 'react-router-dom'

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>()
  return <main><p>Project {id}</p></main>
}
