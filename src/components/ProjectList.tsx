import { Card, CardContent } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRef, useState } from 'react'

interface Project {
  title: string
  description: string
  image: string
  demo?: string // Make demo optional
  code: string
}

interface ProjectListProps {
  projects: Project[]
}

export default function ProjectList({ projects }: ProjectListProps) {
  const [activeProject, setActiveProject] = useState<number | null>(null)
  const projectsRef = useRef<HTMLDivElement>(null)

  const scrollProjects = (direction: 'left' | 'right') => {
    if (projectsRef.current) {
      const scrollAmount = direction === 'left' ? -400 : 400
      projectsRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  return (
    <div className="relative">
      <div className="relative overflow-hidden" style={{ height: '300px' }}>
        <Button
          variant="outline"
          size="icon"
          className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10"
          onClick={() => scrollProjects('left')}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div
          ref={projectsRef}
          className="flex overflow-x-auto space-x-6 py-4 scrollbar-hide"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {projects.map((project, index) => (
            <Card
              key={index}
              className="flex-shrink-0 w-[300px] scroll-snap-align-start cursor-pointer transition-all duration-300 hover:shadow-lg"
              onClick={() => setActiveProject(activeProject === index ? null : index)}
            >
              <img src={project.image} alt={project.title} className="w-full h-48 object-cover" />
              <CardContent className="p-4">
                <h3 className="text-xl font-semibold mb-2">{project.title}</h3>
                <p className="text-sm text-amber-700">Click to view details</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <Button
          variant="outline"
          size="icon"
          className="absolute right-0 top-1/2 transform -translate-y-1/2 z-10"
          onClick={() => scrollProjects('right')}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className={`mt-8 overflow-hidden transition-all duration-300 ease-in-out ${activeProject !== null ? 'max-h-96' : 'max-h-0'}`}>
        {activeProject !== null && (
          <Card>
            <CardContent className="p-6">
              <h3 className="text-2xl font-semibold mb-4">{projects[activeProject].title}</h3>
              <p className="text-lg mb-4">{projects[activeProject].description}</p>
              <div className="flex space-x-4">
                {projects[activeProject].demo && (
                  <Button onClick={() => window.open(projects[activeProject]?.demo, '_blank')}>
                    View Demo
                  </Button>
                )}
                <Button variant="outline" onClick={() => window.open(projects[activeProject]?.code, '_blank')}>
                  View Code
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
