import { DeviceFrameset } from 'react-device-frameset'
import 'react-device-frameset/styles/marvel-devices.min.css'
import './Showcase.css'

const steps = [
  {
    num: '01',
    title: 'Find Your Cravings',
    desc: 'Browse hundreds of menus from the best local restaurants near you.',
  },
  {
    num: '02',
    title: 'Seamless Checkout',
    desc: 'Apply discounts and check out quickly. Pay online or on delivery.',
  },
  {
    num: '03',
    title: 'Fast Delivery',
    desc: 'Track your order live as it heads straight to your door.',
  },
]

export default function Showcase() {
  return (
    <section className="showcase" id="how-it-works">
      <div className="container">
        <div className="showcase-content reveal">
          <span className="section-tag">How It Works</span>
          <h2>Three Steps to Satisfaction.</h2>
          <div className="steps-list">
            {steps.map((s) => (
              <div className="step-item" key={s.num}>
                <div className="step-number">{s.num}</div>
                <div className="step-text">
                  <h4>{s.title}</h4>
                  <p>{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="showcase-image reveal device-container">
          <DeviceFrameset device="iPhone X" color="black">
            <img src="/app-screenshot.png" alt="Chito Mitho App Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </DeviceFrameset>
        </div>
      </div>
    </section>
  )
}
