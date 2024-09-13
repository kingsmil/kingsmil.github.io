import { Github, Linkedin, Mail } from 'lucide-react'
import { Button } from './ui/Button'

interface SocialButtonProps {
  type: 'github' | 'linkedin' | 'email'
  url?: string
}

export default function SocialButton({ type, url }: SocialButtonProps) {
  const handleClick = () => {
    if (type === 'email') {
      window.location.href = `mailto:${url}`
    } else {
      window.open(url, '_blank')
    }
  }

  const icons = {
    github: <Github className="h-6 w-6" />,
    linkedin: <Linkedin className="h-6 w-6" />,
    email: <Mail className="h-6 w-6" />
  }

  return (
    <Button size="icon" variant="outline" onClick={handleClick}>
      {icons[type]}
    </Button>
  )
}
