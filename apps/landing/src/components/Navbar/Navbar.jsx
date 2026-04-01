import { useState, useEffect } from 'react'
import './Navbar.css'

export default function Navbar({ onOpenAuth }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const toggleMenu = () => {
    setMenuOpen(prev => !prev)
    document.body.style.overflow = !menuOpen ? 'hidden' : ''
  }

  const closeMenu = () => {
    setMenuOpen(false)
    document.body.style.overflow = ''
  }

  return (
    <>
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`} id="navbar">
        <div className="container nav-content">
          <a href="#" className="nav-brand">
            <img src="/logo.png" alt="Chito Mitho Logo" />
            <span>Chito Mitho</span>
          </a>
          
          <ul className="nav-links">
            <li><a href="#features">About</a></li>
            <li><a href="#how-it-works">How It Works</a></li>
            <li><a href="#contact">Contact</a></li>
          </ul>

          <div className="nav-right">
            <button className="btn btn-get-started nav-btn" onClick={onOpenAuth}>
              Login
            </button>
            <button
              className={`nav-toggle ${menuOpen ? 'active' : ''}`}
              id="nav-toggle"
              aria-label="Toggle menu"
              onClick={toggleMenu}
            >
               <span></span>
               <span></span>
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile Menu */}
      <div className={`mobile-menu ${menuOpen ? 'open' : ''}`} id="mobile-menu">
        <a href="#features" onClick={closeMenu}>About</a>
        <a href="#how-it-works" onClick={closeMenu}>How It Works</a>
        <a href="#contact" onClick={closeMenu}>Contact</a>
      </div>
    </>
  )
}
