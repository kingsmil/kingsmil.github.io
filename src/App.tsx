"use client"

import { useState, useEffect } from 'react'
import Header from './components/Header'
import Section from './components/Section'
import ProjectList from './components/ProjectList'
import ExperienceList from './components/ExperienceList'
import ScrollToTopButton from './components/ScrollToTopButton'
import Footer from './components/Footer'
import { Card,CardContent } from './components/ui/Card'
import { Button } from './components/ui/Button'
import { ChevronDown, Github, Linkedin, Mail, ChevronLeft, ChevronRight, ChevronRight as ChevronRightIcon, Download, Menu, X, ArrowUp } from 'lucide-react'
  
export default function Portfolio() {
  const [activeSection, setActiveSection] = useState('home')
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showScrollToTop, setShowScrollToTop] = useState(false)

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollToTop(window.scrollY > 300)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      const headerHeight = document.querySelector('header')?.clientHeight || 0
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

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen)
  }

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-orange-100 text-amber-900">
      <Header
        activeSection={activeSection}
        scrollToSection={scrollToSection}
        toggleMobileMenu={toggleMobileMenu}
        mobileMenuOpen={mobileMenuOpen}
      />

      <main className="container mx-auto px-4 md:px-6 py-12 space-y-24">
      <main className="container mx-auto px-4 md:px-6 py-12 space-y-24">
  <Section id="home" title="Home">
    <div className="text-center">
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
    </div>
  </Section>

  <Section id="about" title="About Me">
    <div className="max-w-2xl mx-auto">
      <p className="text-lg leading-relaxed">
        Hello! I'm a passionate software developer with a knack for creating elegant solutions to complex problems. My journey in tech began with a fascination for how things work, which led me to pursue a degree in Computer Science. Now, I channel that curiosity into building robust and user-friendly applications.
      </p>
      <p className="text-lg leading-relaxed mt-4">
        When I'm not coding, you can find me scaling walls at the local bouldering gym, immersed in epic Dungeons & Dragons campaigns, or hitting the gym to stay fit. These diverse interests not only keep me balanced but also fuel my creativity and problem-solving skills in unexpected ways.
      </p>
      <p className="text-lg leading-relaxed mt-4">
        I'm always excited to take on new challenges and collaborate on innovative projects. Let's create something amazing together!
      </p>
    </div>
  </Section>

  <Section id="experience" title="Experience">
    <ExperienceList experiences={experiences} />
  </Section>

  <Section id="education" title="Education">
    <Card className="hover:shadow-md transition-shadow duration-300">
      <CardContent className="p-6">
        <h3 className="text-xl font-semibold mb-2">Bachelor of Science in Computer Science</h3>
        <p className="text-sm text-amber-700 mb-2">University of Technology • 2018 - 2022</p>
        <p className="text-sm">Relevant coursework: Data Structures, Algorithms, Web Development, Database Systems</p>
      </CardContent>
    </Card>
  </Section>

  <Section id="projects" title="Projects">
    <ProjectList projects={projects} />
  </Section>

  <Section id="contact" title="Get in Touch">
    <div className="max-w-md mx-auto text-center">
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
    </div>
  </Section>
</main>

      </main>

      <Footer />

      <ScrollToTopButton showScrollToTop={showScrollToTop} scrollToTop={scrollToTop} />
    </div>
  )
}
