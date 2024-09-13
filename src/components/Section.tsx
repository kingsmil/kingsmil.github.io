import { ReactNode } from 'react'

interface SectionProps {
  id: string
  title: string
  children: ReactNode
}

export default function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="space-y-8">
      <h2 className="text-3xl font-semibold mb-6">{title}</h2>
      {children}
      <div className = "container mx-auto px-4 py- md:px-6 py-3 space-y-12"/>
    </section>
  )
}
