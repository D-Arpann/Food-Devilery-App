import { useState, useRef, useEffect } from 'react';
import './AuthModal.css';

export default function AuthModal({ isOpen, onClose }) {
  const [step, setStep] = useState(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState(['', '', '', '']);
  const otpRefs = [useRef(null), useRef(null), useRef(null), useRef(null)];

  // Reset state when opened
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setPhone('');
      setOtp(['', '', '', '']);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const goBack = () => {
    if (step > 1) {
      setStep(step - 1);
    } else {
      onClose();
    }
  };

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    if (phone.length > 5) setStep(2);
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) return; // Only allow 1 digit
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-advance
    if (value !== '' && index < 3) {
      otpRefs[index + 1].current.focus();
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && otp[index] === '' && index > 0) {
      otpRefs[index - 1].current.focus();
    }
  };

  const handleOtpSubmit = (e) => {
    e.preventDefault();
    setStep(3);
  };

  const handleSignupSubmit = (e) => {
    e.preventDefault();
    // Simulate successful signup
    onClose();
  };

  return (
    <div className="auth-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="auth-modal" onClick={e => e.stopPropagation()}>
        <button className="close-btn" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>

        {step > 1 && (
          <button className="back-btn" onClick={goBack} aria-label="Go back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back</span>
          </button>
        )}

        <div className="auth-content">
          <div className="auth-header-brand">
            <img src="/logo.png" alt="Chito Mitho" className="auth-logo" />
          </div>
          {/* STEP 1: Phone Entry */}
          {step === 1 && (
            <div className="auth-step slide-in">
              <h1>Time to eat</h1>
              <p className="subtitle">Your number is the secret ingredient.</p>
              
              <form onSubmit={handlePhoneSubmit}>
                <div className="phone-input-wrapper">
                  <span className="country-code">+977</span>
                  <input 
                    type="tel" 
                    placeholder="1234567890" 
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    autoFocus
                  />
                </div>
                
                <button type="submit" className="auth-btn auth-btn-solid">Continue</button>
                
                <div className="auth-divider">
                  <span>OR</span>
                </div>
                
                <button type="button" className="auth-btn auth-btn-outline">Other login method</button>
              </form>
            </div>
          )}

          {/* STEP 2: OTP Verification */}
          {step === 2 && (
            <div className="auth-step slide-in">
              <h1>Check your texts</h1>
              <p className="subtitle">Pop in the code from your messages.</p>
              
              <form onSubmit={handleOtpSubmit}>
                <div className="otp-inputs">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      ref={otpRefs[index]}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                    />
                  ))}
                </div>
                
                <button type="submit" className="auth-btn auth-btn-patterned">Verify</button>
                
                <p className="resend-text">
                  Didn't get the code? <strong>Resend</strong>
                </p>
              </form>
            </div>
          )}

          {/* STEP 3: Registration */}
          {step === 3 && (
            <div className="auth-step slide-in">
              <h1>First rodeo?</h1>
              <p className="subtitle">Welcome to the cool table.</p>
              
              <form onSubmit={handleSignupSubmit} className="signup-form">
                <div className="auth-field">
                  <label>Full name</label>
                  <input type="text" placeholder="User For Testing" required />
                </div>

                <div className="auth-field">
                  <label>Email</label>
                  <input type="email" placeholder="user@gmail.com" required />
                </div>

                <div className="auth-field">
                  <label>Date of birth</label>
                  <input type="text" placeholder="1-11-2004" required />
                </div>
                
                <button type="submit" className="auth-btn auth-btn-patterned">Sign up</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
