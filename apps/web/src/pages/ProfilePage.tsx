import { useParams } from 'react-router-dom'

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  return <main><p>Profile {id}</p></main>
}
