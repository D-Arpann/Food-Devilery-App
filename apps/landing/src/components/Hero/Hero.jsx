import './Hero.css'

export default function Hero({ onOpenAuth }) {
  return (
    <section className="hero" id="hero">
      <div className="container">
        <div className="hero-content">
          <h1>
            Your favourite <br />
            food, delivered.
          </h1>

          <p>
            From local momos to global flavors. Discover top-rated restaurants near you, right on your favorite device.
          </p>

          <div className="hero-actions">
            <button className="btn btn-primary" onClick={onOpenAuth}>
              Get Started
            </button>
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
          <img src="/hero-illustration.png" alt="Chito Mitho Illustration" />
        </div>
      </div>
    </section>
  )
}
