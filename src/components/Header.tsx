"use client"

import { useRef } from 'react'
import { Button } from "../components/ui/Button"
import { Menu, X } from 'lucide-react'
import Nav from '../components/Nav'

interface HeaderProps {
  activeSection: string
  scrollToSection: (sectionId: string) => void
  toggleMobileMenu: () => void
  mobileMenuOpen: boolean
}

export default function Header({ activeSection, scrollToSection, toggleMobileMenu, mobileMenuOpen }: HeaderProps) {
  const headerRef = useRef<HTMLElement>(null)

  return (
    <header ref={headerRef} className="sticky top-0 z-20 bg-amber-100 bg-opacity-90 backdrop-blur-sm">
      <nav className="container mx-auto px-4 py-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Moe</h1>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={toggleMobileMenu}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </Button>
          <Nav activeSection={activeSection} scrollToSection={scrollToSection} />
        </div>
        <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'max-h-96' : 'max-h-0'}`}>
          <Nav activeSection={activeSection} scrollToSection={scrollToSection} mobile />
        </div>
      </nav>
    </header>
  )
}
