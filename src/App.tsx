"use client"

import { useState, useEffect } from 'react'
import Header from './components/Header'
import Section from './components/Section'
import ProjectList from './components/ProjectList'
import ExperienceList from './components/ExperienceList'
import ScrollToTopButton from './components/ScrollToTopButton'
import Footer from './components/Footer'
import { Card, CardContent } from './components/ui/Card'
import { Button } from './components/ui/Button'
import SocialButton from './components/SocialButton'
import { Download, Menu, X, ArrowUp } from 'lucide-react'
import dontPaisehImage from './images/dont_paiseh.png'
import rizzumeImage from './images/rizz-ume.png'
import bcrImage from './images/blockchain.png'
import moePhoto from './images/moe_photo.jpeg'

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
        top: offsetPosition - 20,
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
      title: "Don't Paiseh",
      description: "An innovative application that presents users with social questions and answers. Deployed a full end-to-end mobile-first WebApp in 24 hours with a team of four, led frontend development.",
      image: dontPaisehImage,
      demo: "https://devpost.com/software/don-t-paiseh",
      code: "https://github.com/moroha29/HackAndRollFE"
    },
    {
      title: "Rizz-Umé",
      description: "A Telegram bot serving as a personal career consultant for students. Led a team of four to develop this bot, which was deployed as an MVP in 48 hours with swift authentication and database integration.",
      image: rizzumeImage,
      demo: "https://devpost.com/software/rizz-ume?ref_content=user-portfolio&ref_feature=in_progress",
      code: "https://github.com/kingsmil/techfestival"
    },
    {
      title: "NTU Blockchain Research",
      description: "Did research for Andrea Nanetti. Developed a feature using smart contracts to facilitate history collaboration and transparency, designed the permission management system to control user access and track document changes.",
      image: bcrImage,
      demo: "",
      code: "https://github.com/kang5647/hass_blockchain_project"
    }
  ]

  const experiences = [
    {
      role: "Software Data Engineer Intern",
      company: "Advanced Micro Devices (AMD)",
      duration: "May 2023 — Aug 2023",
      responsibilities: [
        "Constructed an ETL pipeline to optimize real-time streaming data processing and analysis; saved executives 90% of their data review time and enabled data-driven decision-making.",
        "Enhanced scalable data quality and management, directly improving data cleaning processes and model accuracy for predictive analytics; improved the speed of forecasting models up to 10x.",
        "Streamlined diagnostics through automation, resulting in a 7.5-hour time savings each week."
      ]
    },
    {
      role: "Software AI Engineer Intern",
      company: "Central Provident Fund (CPF)",
      duration: "May 2023 — Aug 2023",
      responsibilities: [
        "Integrated a ChatGPT variant into a chatbot with open-source LLMs (LLaMA); enhanced user interaction and reduced manual document search time by 2.3x.",
        "Collaborated on multiple cross-functional artificial intelligence (AI) projects at CPF, leading to substantial man-hour savings by 83% (from 60 to 5 minutes per day).",
        "Engineered internal tooling for low-code prompt engineers with a React frontend and Jupyter notebooks; increased the speed of testing and iteration on prompts by an estimated 60%."
      ]
    },
    {
      role: "FullStack Engineer Intern",
      company: "Promisphere Official (Backed by DBS)",
      duration: "May 2022 — Aug 2022",
      responsibilities: [
        "Built and established full cloud infrastructure and systems; established CI/CD Pipelines for efficient deployment in cloud infrastructure, reducing deployment time by 77%.",
        "Executed test-driven development on a Full Stack Web Application by conducting Unit testing, Integration Testing, and E2E Testing; authored over 50+ tests.",
        "Initiated the development of a dApp on blockchain soulbound tokens using ERC-721 Protocol within a 2-week timeframe; articulated project milestones and outlined a roadmap for product expansion."
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

      <main className="container mx-auto px-4 md:px-6 py-12 space-y-0">
      <main className="container mx-auto px-4 md:px-6 py-0 space-y-0">
      <Section title="" id="home">
          <div className="text-center">
            <div className="mb-8">
              <img
                src={moePhoto}
                alt="Moe Thu"
                className="w-48 h-48 object-cover rounded-full mx-auto border-4 border-amber-300 shadow-lg"
              />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Moe T.</h1>
            <p className="text-xl mb-8">Software Developer | D&D Enthusiast | Boulderer</p>
            <div className="flex flex-col sm:flex-row justify-center items-center space-y-4 sm:space-y-0 sm:space-x-4">
              <Button size="lg" onClick={() => window.open('/githubres.pdf', '_blank')} className="text-white bg-black animate-bounce">
                <Download className="mr-2 h-4 w-4" /> Download Resume
              </Button>
              <div className="flex space-x-4">
                <SocialButton type="github" url="https://github.com/kingsmil" />
                <SocialButton type="linkedin" url="https://linkedin.com/in/moe-thu" />
                <SocialButton type="email" url="moe.tiankai@gmail.com" />
              </div>
            </div>
          </div>
        </Section>

        <Section id="about" title="About Me">
          <div className="max-w-2xl mx-auto">
            <p className="text-lg leading-relaxed">
              Hey! I build stuff!
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
              <p className="text-sm text-amber-700 mb-2">Nanyang Technological University</p>
              <p className="text-sm text-amber-700 mb-2">Exchange Semester at Northeastern University for Computer Science</p>
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
        <SocialButton type="github" url="https://github.com/kingsmil" />
        <SocialButton type="linkedin" url="https://linkedin.com/in/moe-thu" />
        <SocialButton type="email" url="moe.tiankai@gmail.com" />
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
