import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return (
    <div>
      <h1>Galatea</h1>
      <p>Homeostasis-based AI agent system.</p>
    </div>
  )
}
