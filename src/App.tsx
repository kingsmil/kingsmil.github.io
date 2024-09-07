"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ChevronRight, Music, Github, Linkedin } from "lucide-react"

const projects = [
  { id: 1, title: "Cherry Wine App", image: "/placeholder.svg?height=300&width=400" },
  { id: 2, title: "Vintage Paper Blog", image: "/placeholder.svg?height=300&width=400" },
  { id: 3, title: "Indie Music Player", image: "/placeholder.svg?height=300&width=400" },
  { id: 4, title: "Retro Photo Gallery", image: "/placeholder.svg?height=300&width=400" },
]

const CrumpledPaper = ({ children, isExpanded, onClick }) => (
  <motion.div
    className="relative w-48 h-48 md:w-64 md:h-64 m-4 cursor-pointer"
    whileHover={{ scale: 1.05 }}
    animate={{
      width: isExpanded ? "100%" : "auto",
      height: isExpanded ? "300px" : "auto",
    }}
    transition={{ duration: 0.5 }}
    onClick={onClick}
  >
    <svg width="0" height="0">
      <filter id="crumpled-paper">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="5" seed="1" />
        <feDisplacementMap in="SourceGraphic" scale="20" />
      </filter>
    </svg>
    <motion.div
      className="absolute inset-0 bg-amber-100 rounded-full overflow-hidden"
      style={{ filter: "url(#crumpled-paper)" }}
      animate={{
        borderRadius: isExpanded ? "16px" : "50%",
      }}
      transition={{ duration: 0.5 }}
    >
      {children}
    </motion.div>
  </motion.div>
)

export default function IndiePortfolio() {
  const [expandedId, setExpandedId] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-amber-50 text-amber-900 p-8">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold mb-2">Jane Doe</h1>
        <p className="text-xl">Final Year Student & Indie Developer</p>
      </header>

      <nav className="mb-12 flex justify-center space-x-4">
        <a href="#about" className="hover:text-amber-700 transition-colors">About</a>
        <a href="#projects" className="hover:text-amber-700 transition-colors">Projects</a>
        <a href="#contact" className="hover:text-amber-700 transition-colors">Contact</a>
      </nav>

      <section id="about" className="mb-16 text-center max-w-2xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">About Me</h2>
        <p className="mb-4">
          Hey there! I'm Jane, a final year student with a passion for creating indie-inspired digital experiences. 
          Just like grentperez's "Cherry Wine", I believe in crafting projects that are smooth, warm, and leave a lasting impression.
        </p>
        <div className="flex justify-center space-x-4">
          <a href="#" className="text-amber-700 hover:text-amber-900 transition-colors">
            <Github size={24} />
          </a>
          <a href="#" className="text-amber-700 hover:text-amber-900 transition-colors">
            <Linkedin size={24} />
          </a>
          <a href="#" className="text-amber-700 hover:text-amber-900 transition-colors">
            <Music size={24} />
          </a>
        </div>
      </section>

      <section id="projects" className="mb-16">
        <h2 className="text-2xl font-semibold mb-8 text-center">My Projects</h2>
        <div className="flex flex-wrap justify-center">
          {projects.map((project) => (
            <CrumpledPaper
              key={project.id}
              isExpanded={expandedId === project.id}
              onClick={() => setExpandedId(expandedId === project.id ? null : project.id)}
            >
              <motion.div
                className="absolute inset-0 flex items-center justify-center"
                initial={{ opacity: 1 }}
                animate={{ opacity: expandedId === project.id ? 0 : 1 }}
                transition={{ duration: 0.5 }}
              >
                <h3 className="text-xl font-semibold text-amber-900">{project.title}</h3>
              </motion.div>
              <motion.img
                src={project.image}
                alt={project.title}
                className="absolute inset-0 w-full h-full object-cover"
                initial={{ opacity: 0 }}
                animate={{ opacity: expandedId === project.id ? 1 : 0 }}
                transition={{ duration: 0.5 }}
              />
              <motion.div
                className="absolute bottom-4 right-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: expandedId === project.id ? 1 : 0 }}
                transition={{ duration: 0.5 }}
              >
                <ChevronRight className="text-white" size={24} />
              </motion.div>
            </CrumpledPaper>
          ))}
        </div>
      </section>

      <section id="contact" className="text-center">
        <h2 className="text-2xl font-semibold mb-4">Get in Touch</h2>
        <p className="mb-4">Feel free to reach out for collaborations or just a friendly chat.</p>
        <a
          href="mailto:jane@example.com"
          className="inline-block bg-amber-700 text-white px-6 py-2 rounded-full hover:bg-amber-800 transition-colors"
        >
          Say Hello
        </a>
      </section>

      <footer className="mt-16 text-center text-sm text-amber-700">
        <p>&copy; 2023 Jane Doe. All rights reserved.</p>
      </footer>
    </div>
  )
}