import { useEffect, useState } from 'react'
import { DeviceFrameset } from 'react-device-frameset'
import 'react-device-frameset/styles/marvel-devices.min.css'
import { submitContactForm } from '@repo/api'
import { AppScreenshot, HeroIllustration, Logo } from '@repo/ui'
import './WebPage.css'

const features = [
  {
    title: 'Live order tracking',
    desc: 'Customers see each kitchen and rider status change without refreshing the page.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    title: 'Verified local kitchens',
    desc: 'Restaurants register with location, bio, banner, profile image, and admin approval before appearing.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
      </svg>
    ),
  },
  {
    title: 'One connected workflow',
    desc: 'Customer ordering, restaurant queue, admin approvals, and rider jobs use the same Supabase data.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
        <line x1="12" y1="18" x2="12.01" y2="18" />
      </svg>
    ),
  },
]

const steps = [
  {
    num: '01',
    title: 'Browse verified restaurants',
    desc: 'See real restaurant profiles, menus, photos, bios, and delivery-ready locations.',
  },
  {
    num: '02',
    title: 'Place and pay',
    desc: 'Checkout with cash or eSewa. Paid orders return to the order screen for tracking.',
  },
  {
    num: '03',
    title: 'Track through delivery',
    desc: 'Restaurant status, rider assignment, pickup, arrival, and delivery all sync live.',
  },
]

export default function WebPage({ supabase, onOpenLogin, onOpenRestaurantSignup }) {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const [contactLoading, setContactLoading] = useState(false)
  const [contactError, setContactError] = useState('')

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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

  useEffect(() => {
    const handleClick = (e) => {
      const anchor = e.target.closest('a')
      const href = anchor?.getAttribute('href')

      if (href?.startsWith('#') && href.length > 1) {
        const target = document.querySelector(href)
        if (target) {
          e.preventDefault()
          const navbar = document.getElementById('navbar')
          const navbarHeight =
            navbar?.getBoundingClientRect().height ||
            parseInt(getComputedStyle(document.documentElement).getPropertyValue('--navbar-height')) ||
            80
          const y = target.getBoundingClientRect().top + window.scrollY - navbarHeight
          window.scrollTo({ top: y, behavior: 'smooth' })
          setMenuOpen(false)
        }
      }
    }

    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const toggleMenu = () => {
    setMenuOpen((prev) => !prev)
    document.body.style.overflow = !menuOpen ? 'hidden' : ''
  }

  const closeMenu = () => {
    setMenuOpen(false)
    document.body.style.overflow = ''
  }

  const handleContactSubmit = async (e) => {
    e.preventDefault()
    setContactError('')

    const formData = new FormData(e.target)
    const name = formData.get('name') || ''
    const email = formData.get('email') || ''
    const message = formData.get('message') || ''

    if (supabase) {
      setContactLoading(true)
      const { error } = await submitContactForm(supabase, { name, email, message })
      setContactLoading(false)

      if (error) {
        setContactError(error.message || 'Could not send your message right now.')
        return
      }
    }

    setSent(true)
    setTimeout(() => {
      setSent(false)
      e.target.reset()
    }, 3000)
  }

  return (
    <>
      <nav className={`navbar ${scrolled ? 'scrolled' : ''}`} id="navbar">
        <div className="container nav-content">
          <a href="#" className="nav-brand">
            <img src={Logo} alt="Chito Mitho Logo" />
            <span>Chito Mitho</span>
          </a>

          <ul className="nav-links">
            <li>
              <a href="#features">About</a>
            </li>
            <li>
              <a href="#how-it-works">How It Works</a>
            </li>
            <li>
              <a href="#contact">Contact</a>
            </li>
          </ul>

          <div className="nav-right">
            <button
              type="button"
              className="btn btn-outline nav-restaurant-btn"
              onClick={onOpenRestaurantSignup}
            >
              For Restaurants
            </button>
            <button className="btn btn-get-started nav-btn" onClick={onOpenLogin}>
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

      <div className={`mobile-menu ${menuOpen ? 'open' : ''}`} id="mobile-menu">
        <a href="#features" onClick={closeMenu}>
          About
        </a>
        <a href="#how-it-works" onClick={closeMenu}>
          How It Works
        </a>
        <a href="#contact" onClick={closeMenu}>
          Contact
        </a>
        <button
          type="button"
          className="mobile-menu-button"
          onClick={() => {
            closeMenu()
            onOpenRestaurantSignup?.()
          }}
        >
          Register Your Restaurant
        </button>
      </div>

      <section className="hero" id="hero">
        <div className="container">
          <div className="hero-content">
            <h1>
              Your favourite <br />
              food, delivered.
            </h1>

            <p>
              A connected food delivery system for Kathmandu: customers order, restaurants manage kitchens,
              riders claim pickups, and admins keep the marketplace healthy.
            </p>

            <div className="hero-actions">
              <div className="hero-primary-actions">
                <button className="btn btn-primary" onClick={onOpenLogin}>
                  Get Started
                </button>
                <button className="btn btn-outline" onClick={onOpenRestaurantSignup}>
                  Register Your Restaurant
                </button>
              </div>
              <div className="store-links">
                <span>Or download the App:</span>
                <div className="store-badges">
                  <a href="#" aria-label="Download on App Store" className="store-badge-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    App Store
                  </a>
                  <a href="#" aria-label="Get it on Google Play" className="store-badge-btn">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                      <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 010 1.38l-2.302 2.302L15.396 13l2.302-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.635-8.635z" />
                    </svg>
                    Google Play
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="hero-image">
            <img src={HeroIllustration} alt="Chito Mitho Illustration" />
          </div>
        </div>
      </section>

      <section className="features" id="features">
        <div className="container">
          <div className="section-header reveal">
            <span className="section-tag">Why Chito Mitho?</span>
            <h2>Everything you crave.</h2>
          </div>
          <div className="features-grid">
            {features.map((f, i) => (
              <div className="feature-card reveal" key={i}>
                <div className="feature-icon">{f.icon}</div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="showcase" id="how-it-works">
        <div className="container">
          <div className="showcase-content reveal">
            <span className="section-tag">How It Works</span>
            <h2>Three Steps to Satisfaction.</h2>
            <div className="steps-list">
              {steps.map((step) => (
                <div className="step-item" key={step.num}>
                  <div className="step-number">{step.num}</div>
                  <div className="step-text">
                    <h4>{step.title}</h4>
                    <p>{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="showcase-image reveal device-container">
            <DeviceFrameset device="iPhone X" color="black">
              <img
                src={AppScreenshot}
                alt="Chito Mitho App Preview"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </DeviceFrameset>
          </div>
        </div>
      </section>

      <section className="contact" id="contact">
        <div className="container">
          <div className="contact-info reveal">
            <span className="section-tag">Contact Us</span>
            <h2>Let's Talk.</h2>
            <p>
              Have a question, feedback, or looking to partner with Chito Mitho? We'd love to hear from you.
            </p>
            <div className="contact-details">
              <div className="contact-item">
                <div className="contact-text">
                  <strong>Email</strong>
                  <a href="mailto:hello@chitomitho.com">hello@chitomitho.com</a>
                </div>
              </div>
              <div className="contact-item">
                <div className="contact-text">
                  <strong>Phone</strong>
                  <a href="tel:+9771234567890">+977 1234567890</a>
                </div>
              </div>
              <div className="contact-item">
                <div className="contact-text">
                  <strong>Office</strong>
                  <span>Kathmandu, Nepal</span>
                </div>
              </div>
            </div>
          </div>

          <div className="contact-form-wrapper reveal">
            <form className="contact-form" onSubmit={handleContactSubmit}>
              <div className="form-group">
                <label htmlFor="contact-name">Name</label>
                <input type="text" id="contact-name" name="name" placeholder="John Doe" required />
              </div>
              <div className="form-group">
                <label htmlFor="contact-email">Email</label>
                <input type="email" id="contact-email" name="email" placeholder="john@example.com" required />
              </div>
              <div className="form-group">
                <label htmlFor="contact-message">Message</label>
                <textarea id="contact-message" name="message" rows="4" placeholder="How can we help?" required></textarea>
              </div>
              {contactError ? <p className="contact-form-error">{contactError}</p> : null}
              <button type="submit" className={`btn ${sent ? 'btn-sent' : 'btn-primary'}`} disabled={contactLoading}>
                {contactLoading ? 'Sending...' : sent ? 'Sent Successfully' : 'Send Message'}
              </button>
            </form>
          </div>
        </div>
      </section>

      <footer className="footer">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a href="#" className="nav-brand">
                <img src={Logo} alt="Chito Mitho Logo" />
                <span>Chito Mitho</span>
              </a>
              <p>
                Your favourite food, delivered fast. Bringing the best local restaurants of Kathmandu to your
                doorstep.
              </p>
            </div>

            <div className="footer-col">
              <h4>Company</h4>
              <ul>
                <li>
                  <a href="#">About Us</a>
                </li>
                <li>
                  <a href="#">Careers</a>
                </li>
                <li>
                  <a href="#">Blog</a>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Support</h4>
              <ul>
                <li>
                  <a href="#contact">Contact Us</a>
                </li>
                <li>
                  <button type="button" className="footer-link-button" onClick={onOpenRestaurantSignup}>
                    Partner With Us
                  </button>
                </li>
                <li>
                  <a href="#">Ride With Us</a>
                </li>
                <li>
                  <a href="#">FAQs</a>
                </li>
              </ul>
            </div>

            <div className="footer-col">
              <h4>Legal</h4>
              <ul>
                <li>
                  <a href="#">Terms of Service</a>
                </li>
                <li>
                  <a href="#">Privacy Policy</a>
                </li>
                <li>
                  <a href="#">Cookie Policy</a>
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom">
            <div className="footer-left">
              <p>&copy; {new Date().getFullYear()} Chito Mitho. All rights reserved.</p>
            </div>
            <div className="footer-socials">
              <a href="#" aria-label="Facebook">
                FB
              </a>
              <a href="#" aria-label="Instagram">
                IG
              </a>
              <a href="#" aria-label="Twitter">
                TW
              </a>
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
