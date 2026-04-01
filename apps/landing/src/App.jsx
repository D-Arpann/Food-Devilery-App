import { useState, useEffect } from 'react'
import Navbar from './components/Navbar/Navbar'
import Hero from './components/Hero/Hero'
import Features from './components/Features/Features'
import Showcase from './components/Showcase/Showcase'
import Contact from './components/Contact/Contact'
import Footer from './components/Footer/Footer'
import AuthModal from './components/AuthModal/AuthModal'

export default function App() {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)

  // Scroll reveal observer
  useEffect(() => {
    const revealElements = document.querySelectorAll('.reveal')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.1, rootMargin: '0px 0px -30px 0px' }
    )
    revealElements.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Smooth scroll for anchor links with navbar offset
  useEffect(() => {
    const handleClick = (e) => {
      const anchor = e.target.closest('a')
      const href = anchor?.getAttribute('href')
      if (href?.startsWith('#') && href.length > 1) {
        const target = document.querySelector(href)
        if (target) {
          e.preventDefault()
          const navbarHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navbar-height')) || 80
          const y = target.getBoundingClientRect().top + window.scrollY - navbarHeight
          window.scrollTo({ top: y, behavior: 'smooth' })
        }
      }
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  return (
    <>
      <Navbar onOpenAuth={() => setIsAuthModalOpen(true)} />
      <Hero onOpenAuth={() => setIsAuthModalOpen(true)} />
      <Features />
      <Showcase />
      <Contact />
      <Footer />
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </>
  )
}
