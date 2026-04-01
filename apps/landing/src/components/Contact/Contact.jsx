import { useState } from 'react'
import './Contact.css'

export default function Contact() {
  const [sent, setSent] = useState(false)

  const handleSubmit = (e) => {
    e.preventDefault()
    setSent(true)
    setTimeout(() => {
      setSent(false)
      e.target.reset()
    }, 3000)
  }

  return (
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
          <form className="contact-form" id="contact-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="contact-name">Name</label>
              <input type="text" id="contact-name" placeholder="John Doe" required />
            </div>
            <div className="form-group">
              <label htmlFor="contact-email">Email</label>
              <input type="email" id="contact-email" placeholder="john@example.com" required />
            </div>
            <div className="form-group">
              <label htmlFor="contact-message">Message</label>
              <textarea id="contact-message" rows="4" placeholder="How can we help?" required></textarea>
            </div>
            <button
              type="submit"
              className={`btn ${sent ? 'btn-sent' : 'btn-primary'}`}
              id="contact-submit"
            >
              {sent ? 'Sent Successfully' : 'Send Message'}
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
