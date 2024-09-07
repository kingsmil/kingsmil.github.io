import { useState } from 'react'
import { Card, CardContent } from "../components/ui/Card"
import { Button } from "../components/ui/Button"
import { ChevronRight as ChevronRightIcon } from 'lucide-react'

interface Experience {
  role: string
  company: string
  duration: string
  responsibilities: string[]
}

interface ExperienceListProps {
  experiences: Experience[]
}

export default function ExperienceList({ experiences }: ExperienceListProps) {
  const [expandedExperiences, setExpandedExperiences] = useState<number[]>([])

  const toggleExperience = (index: number) => {
    setExpandedExperiences(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 h-full w-0.5 bg-amber-300" />
      <div className="absolute left-4 top-0 w-8 h-8 -mt-4 -ml-4 bg-amber-300 rounded-full flex items-center justify-center">
        <div className="w-4 h-4 bg-amber-600 rounded-full" />
      </div>
      {experiences.map((exp, index) => (
        <Card key={index} className="mb-8 ml-8 hover:shadow-md transition-shadow duration-300">
          <CardContent className="p-6">
            <h3 className="text-xl font-semibold mb-2">{exp.role}</h3>
            <p className="text-sm text-amber-700 mb-2">{exp.company} • {exp.duration}</p>
            <Button
              variant="ghost"
              className="text-left p-0 hover:bg-transparent"
              onClick={() => toggleExperience(index)}
            >
              <ChevronRightIcon className={`h-4 w-4 mr-2 transition-transform ${expandedExperiences.includes(index) ? 'rotate-90' : ''}`} />
              {expandedExperiences.includes(index) ? 'Hide' : 'Show'} responsibilities
            </Button>
            <div className={`mt-2 overflow-hidden transition-all duration-300 ease-in-out ${expandedExperiences.includes(index) ? 'max-h-96' : 'max-h-0'}`}>
              <ul className="list-disc list-inside space-y-2 text-sm">
                {exp.responsibilities.map((resp, i) => (
                  <li key={i}>{resp}</li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
