"use client"

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Github, Linkedin, Mail, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon, Download, Menu, X, ArrowUp } from 'lucide-react'
import { Button } from "../src/components/ui/Button"
import { Card, CardContent } from "../src/components/ui/Card"

export default function Portfolio() {
  const [activeSection, setActiveSection] = useState('home')
  const [activeProject, setActiveProject] = useState<number | null>(null)
  const [expandedExperiences, setExpandedExperiences] = useState<number[]>([])
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showScrollToTop, setShowScrollToTop] = useState(false)
  const projectsRef = useRef<HTMLDivElement>(null)
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const projects = [
    {
      title: "Project 1",
      description: "A web application for managing personal finances. Built with React and Node.js, it features real-time data visualization and secure user authentication.",
      image: "/placeholder.svg?height=400&width=600",
      demo: "https://project1-demo.com",
      code: "https://github.com/yourusername/project1"
    },
    {
      title: "Project 2",
      description: "An AI-powered chatbot for customer service. Developed using Python and TensorFlow, it employs natural language processing to provide accurate and helpful responses.",
      image: "/placeholder.svg?height=400&width=600",
      demo: "https://project2-demo.com",
      code: "https://github.com/yourusername/project2"
    },
    {
      title: "Project 3",
      description: "A mobile app for tracking fitness goals. Created with React Native and Firebase, it offers personalized workout plans and progress tracking.",
      image: "/placeholder.svg?height=400&width=600",
      demo: "https://project3-demo.com",
      code: "https://github.com/yourusername/project3"
    },
    {
      title: "Project 4",
      description: "An e-commerce platform for artisanal products. Built with Vue.js and Stripe integration, it provides a seamless shopping experience with secure payment processing.",
      image: "/placeholder.svg?height=400&width=600",
      demo: "https://project4-demo.com",
      code: "https://github.com/yourusername/project4"
    }
  ]

  const experiences = [
    {
      role: "Software Developer Intern",
      company: "Tech Innovators Inc.",
      duration: "June 2022 - August 2022",
      responsibilities: [
        "Developed and maintained web applications using React and Node.js",
        "Collaborated with senior developers to implement new features",
        "Participated in code reviews and agile development processes"
      ]
    },
    {
      role: "Junior Web Developer",
      company: "Digital Solutions Ltd.",
      duration: "September 2022 - May 2023",
      responsibilities: [
        "Created responsive and accessible web designs using HTML, CSS, and JavaScript",
        "Optimized website performance and implemented SEO best practices",
        "Worked closely with designers to bring mockups to life"
      ]
    },
    {
      role: "IT Support Specialist",
      company: "Global Systems Corp.",
      duration: "June 2023 - Present",
      responsibilities: [
        "Provided technical support for software and hardware issues",
        "Managed and maintained company IT infrastructure",
        "Implemented cybersecurity measures to protect sensitive data"
      ]
    }
  ]

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element && headerRef.current) {
      const headerHeight = headerRef.current.offsetHeight
      const elementPosition = element.getBoundingClientRect().top
      const offsetPosition = elementPosition + window.pageYOffset - headerHeight

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      })
      setActiveSection(sectionId)
      setMobileMenuOpen(false)
    }
  }

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const scrollProjects = (direction: 'left' | 'right') => {
    if (projectsRef.current) {
      const scrollAmount = direction === 'left' ? -400 : 400
      projectsRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' })
    }
  }

  const toggleExperience = (index: number) => {
    setExpandedExperiences(prev =>
      prev.includes(index) ? prev.filter(i => i !== index) : [...prev, index]
    )
  }

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 text-amber-900">
      <header ref={headerRef} className="sticky top-0 z-20 bg-amber-100 bg-opacity-90 backdrop-blur-sm">
        <nav className="container mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Your Name</h1>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={toggleMobileMenu}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
            <ul className="hidden md:flex space-x-6">
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
          </div>
          <div className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'max-h-96' : 'max-h-0'}`}>
            <ul className="mt-4 space-y-2 bg-amber-50 rounded-lg p-4 shadow-md">
              {['home', 'about', 'experience', 'education', 'projects', 'contact'].map((section) => (
                <li key={section}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => scrollToSection(section)}
                    className={`w-full text-left text-lg ${activeSection === section ? 'text-amber-700 font-semibold' : 'text-amber-900'}`}
                  >
                    {section.charAt(0).toUpperCase() + section.slice(1)}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      <main className="container mx-auto px-4 md:px-6 py-12 space-y-24">
        <section id="home" className="text-center">
          <div className="mb-8">
            <img
              src="/placeholder.svg?height=200&width=200"
              alt="Your Name"
              className="w-48 h-48 rounded-full mx-auto border-4 border-amber-300 shadow-lg"
            />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Your Name</h1>
          <p className="text-xl mb-8">Software Developer | D&D Enthusiast | Boulderer</p>
          <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
            <Button size="lg" onClick={() => window.open('/resume.pdf', '_blank')} className="text-white bg-black animate-bounce">
              <Download className="mr-2 h-4 w-4" /> Download Resume
            </Button>
            <div className="flex space-x-4">
              <Button size="icon" variant="outline" onClick={() => window.open('https://github.com/yourusername', '_blank')}>
                <Github className="h-6 w-6" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => window.open('https://linkedin.com/in/yourusername', '_blank')}>
                <Linkedin className="h-6 w-6" />
              </Button>
              <Button size="icon" variant="outline" onClick={() => window.location.href = 'mailto:your.email@example.com'}>
                <Mail className="h-6 w-6" />
              </Button>
            </div>
          </div>
        </section>

        <section id="about" className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-semibold mb-6">About Me</h2>
          <p className="text-lg leading-relaxed">
            Hello! I'm a passionate software developer with a knack for creating elegant solutions to complex problems. My journey in tech began with a fascination for how things work, which led me to pursue a degree in Computer Science. Now, I channel that curiosity into building robust and user-friendly applications.
          </p>
          <p className="text-lg leading-relaxed mt-4">
            When I'm not coding, you can find me scaling walls at the local bouldering gym, immersed in epic Dungeons & Dragons campaigns, or hitting the gym to stay fit. These diverse interests not only keep me balanced but also fuel my creativity and problem-solving skills in unexpected ways.
          </p>
          <p className="text-lg leading-relaxed mt-4">
            I'm always excited to take on new challenges and collaborate on innovative projects. Let's create something amazing together!
          </p>
        </section>

        <section id="experience" className="space-y-8">
          <h2 className="text-3xl font-semibold mb-6">Experience</h2>
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
        </section>

        <section id="education" className="space-y-8">
          <h2 className="text-3xl font-semibold mb-6">Education</h2>
          <Card className="hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-6">
              <h3 className="text-xl font-semibold mb-2">Bachelor of Science in Computer Science</h3>
              <p className="text-sm text-amber-700 mb-2">University of Technology • 2018 - 2022</p>
              <p className="text-sm">Relevant coursework: Data Structures, Algorithms, Web Development, Database Systems</p>
            </CardContent>
          </Card>
        </section>

        <section id="projects" className="space-y-8">
          <h2 className="text-3xl font-semibold mb-6">Projects</h2>
          <div className="relative">
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
                <Card key={index} className="flex-shrink-0 w-[300px] scroll-snap-align-start cursor-pointer transition-all duration-300 hover:shadow-lg" onClick={() => setActiveProject(activeProject === index ? null : index)}>
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
                    <Button onClick={() => window.open(projects[activeProject].demo, '_blank')}>
                      View Demo
                    </Button>
                    <Button variant="outline" onClick={() => window.open(projects[activeProject].code, '_blank')}>
                      View Code
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </section>

        <section id="contact" className="max-w-md mx-auto text-center">
          <h2 className="text-3xl font-semibold mb-6">Get in Touch</h2>
          <p className="mb-6">I'm always open to new opportunities and collaborations. Feel free to reach out!</p>
          <div className="flex justify-center space-x-4">
            <Button size="icon" variant="outline" onClick={() => window.open('https://github.com/yourusername', '_blank')}>
              <Github className="h-6 w-6" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => window.open('https://linkedin.com/in/yourusername', '_blank')}>
              <Linkedin className="h-6 w-6" />
            </Button>
            <Button size="icon" variant="outline" onClick={() => window.location.href = 'mailto:your.email@example.com'}>
              <Mail className="h-6 w-6" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="bg-amber-200 py-6 mt-24">
        <div className="container mx-auto px-6 text-center">
          <p>&copy; 2023 Your Name. All rights reserved.</p>
        </div>
      </footer>

      {showScrollToTop && (
        <Button
          variant="outline"
          size="icon"
          className="fixed bottom-8 right-8 bg-amber-100 text-amber-900 rounded-full shadow-md hover:bg-amber-200 transition-all duration-300"
          onClick={scrollToTop}
          aria-label="Scroll to top"
        >
          <ArrowUp className="h-6 w-6" />
        </Button>
      )}
    </div>
  )
}