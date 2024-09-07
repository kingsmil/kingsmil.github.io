import { Button } from "../components/ui/Button"

interface NavProps {
  activeSection: string
  scrollToSection: (sectionId: string) => void
  mobile?: boolean
}

export default function Nav({ activeSection, scrollToSection, mobile = false }: NavProps) {
  return (
    <ul className={`${mobile ? 'mt-4 space-y-2 bg-amber-50 rounded-lg p-4 shadow-md' : 'hidden md:flex space-x-6'}`}>
      {['home', 'about', 'experience', 'education', 'projects', 'contact'].map((section) => (
        <li key={section}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => scrollToSection(section)}
            className={`text-lg ${activeSection === section ? 'text-amber-700 font-semibold' : 'text-amber-900'}`}
          >
            {section.charAt(0).toUpperCase() + section.slice(1)}
          </Button>
        </li>
      ))}
    </ul>
  )
}
