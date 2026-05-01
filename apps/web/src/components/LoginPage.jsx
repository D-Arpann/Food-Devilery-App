import { useEffect } from 'react'
import {
  AUTH_OTP_LENGTH,
  AUTH_STEP,
  NEPAL_COUNTRY_CODE,
  onlyDigits,
} from '@repo/utils'
import { Button, Input, Logo, usePhoneAuthFlow } from '@repo/ui'
import './LoginPage.css'

const LOGIN_COPY = {
  phone: {
    kicker: 'Secure login',
    title: 'Welcome back',
    subtitle: 'Enter your phone number to continue ordering, manage your account, or register a restaurant.',
    action: 'Continue',
    helper: 'No password needed — we\'ll send you a one-time code.',
  },
  otp: {
    kicker: 'Verification',
    title: 'Enter your code',
    subtitle: 'We sent a 6-digit code to',
    action: 'Verify code',
    resendLead: "Didn't receive it?",
    resendAction: 'Resend code',
  },
  signup: {
    kicker: 'Create account',
    title: 'Finish your account',
    subtitle: 'A few details to connect your orders and account.',
    action: 'Create account',
    fullNameLabel: 'Full name',
    emailLabel: 'Email',
    dobLabel: 'Date of birth',
    fullNamePlaceholder: 'Your name',
    emailPlaceholder: 'you@example.com',
    dobPlaceholder: 'YYYY-MM-DD',
    disclaimer: 'By creating an account, you agree to the Chito Mitho terms of service.',
  },
}

const authFieldStyle = {
  background: '#FFFFFF',
  border: '1px solid #EAEAEA',
  borderRadius: '10px',
  minHeight: '54px',
  padding: '0 16px',
}

const phoneInputTextStyle = {
  fontSize: '1rem',
  fontWeight: 600,
  color: '#1E1E1E',
}

const phonePrefixStyle = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#5E5E5E',
}

const ctaButtonStyle = {
  width: '100%',
  minHeight: '52px',
  borderRadius: '8px',
  fontSize: '1rem',
  fontWeight: 600,
  backgroundColor: '#F8964F',
  borderColor: '#FFDCC3',
  color: '#FFFFFF',
  boxShadow: 'none',
}

export default function LoginPage({ supabase, notice = '', onAuthenticated, onBack, onOpenRestaurantSignup }) {
  const {
    step,
    phone,
    setPhone,
    otpDigits,
    setOtpDigit,
    setOtpCode,
    fullName,
    setFullName,
    email,
    setEmail,
    dob,
    setDob,
    loading,
    error,
    resetFlow,
    goBack,
    submitPhone,
    submitOtp,
    submitSignup,
    resendOtp,
  } = usePhoneAuthFlow({
    supabase,
    onAuthenticated,
  })

  useEffect(() => {
    resetFlow()
  }, [resetFlow])

  const handleBack = () => {
    const steppedBack = goBack()

    if (!steppedBack) {
      onBack?.()
    }
  }

  const handleNavigateAway = () => {
    // If user leaves while on SIGNUP step, a session exists from OTP verification
    // but no profile was created. Sign out to prevent auto-login with fallback data.
    if (step === AUTH_STEP.SIGNUP && supabase) {
      supabase.auth.signOut().catch(() => {})
    }

    onBack?.()
  }

  const handleOtpChange = (index, value) => {
    const digit = setOtpDigit(index, value)

    if (digit && index < AUTH_OTP_LENGTH - 1) {
      const nextInput = document.getElementById(`otp-${index + 1}`)
      nextInput?.focus()
    }
  }

  const handleOtpKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`)
      prevInput?.focus()
    }
  }

  const handleOtpPaste = (event) => {
    const pasted = onlyDigits(event.clipboardData.getData('text')).slice(0, AUTH_OTP_LENGTH)

    if (!pasted) {
      return
    }

    event.preventDefault()
    setOtpCode(pasted)
  }

  const handlePhoneSubmit = async (event) => {
    event.preventDefault()
    await submitPhone()
  }

  const handleOtpSubmit = async (event) => {
    event.preventDefault()
    await submitOtp()
  }

  const handleSignupSubmit = async (event) => {
    event.preventDefault()
    await submitSignup()
  }

  const handleResend = async () => {
    await resendOtp()
  }

  return (
    <main className="login-page">
      <nav className="login-nav">
        <div className="container login-nav-inner">
          <button type="button" className="login-brand" onClick={handleNavigateAway}>
            <img src={Logo} alt="Chito Mitho logo" />
            <span>Chito Mitho</span>
          </button>

          <button type="button" className="btn btn-outline login-home-button" onClick={handleNavigateAway}>
            Back to Home
          </button>
        </div>
      </nav>

      <section className="login-section">
        <div className="container login-layout">
          <div className="login-page-header">
            <span className="section-tag">Chito Mitho Account</span>
            <h1>Sign in.</h1>
            <p>One account for ordering, checkout, and restaurant onboarding.</p>
            <div className="login-feature-grid" aria-hidden="true">
              <article>
                <svg className="login-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 6h16l-2 8H7L5 3H2" /><circle cx="9" cy="20" r="1.6" /><circle cx="17" cy="20" r="1.6" /></svg>
                <strong>Fast checkout</strong>
                <span>Saved delivery details and cart handoff.</span>
              </article>
              <article>
                <svg className="login-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 21s6-5.1 6-10a6 6 0 1 0-12 0c0 4.9 6 10 6 10Z" /><circle cx="12" cy="11" r="2" /></svg>
                <strong>Live orders</strong>
                <span>Current and past orders in one place.</span>
              </article>
              <article>
                <svg className="login-feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20.8 8.6c0 5.3-8.8 10.2-8.8 10.2S3.2 13.9 3.2 8.6A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 8.8 1.9Z" /></svg>
                <strong>Local favorites</strong>
                <span>Keep your go-to restaurants close.</span>
              </article>
            </div>
          </div>

          <div className="login-card" aria-label="Login form">
            {step !== AUTH_STEP.PHONE && (
              <button type="button" className="login-back" onClick={handleBack}>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                Back
              </button>
            )}

            {notice && <p className="login-notice">{notice}</p>}
            {error && <p className="login-error">{error}</p>}

            {step === AUTH_STEP.PHONE && (
              <div className="login-step">
                <div className="login-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="6" y="2" width="12" height="20" rx="3" /><circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" /></svg>
                </div>
                <span className="login-kicker">{LOGIN_COPY.phone.kicker}</span>
                <h2>{LOGIN_COPY.phone.title}</h2>
                <p className="login-subtitle">{LOGIN_COPY.phone.subtitle}</p>

                <form onSubmit={handlePhoneSubmit}>
                  <Input
                    placeholder="98XXXXXXXX"
                    value={phone}
                    onChangeText={setPhone}
                    inputMode="tel"
                    maxLength={10}
                    autoComplete="tel-national"
                    prefix={NEPAL_COUNTRY_CODE}
                    prefixStyle={phonePrefixStyle}
                    inputStyle={phoneInputTextStyle}
                    autoFocus
                    style={authFieldStyle}
                  />

                  <Button
                    type="submit"
                    title={loading ? 'Sending code...' : LOGIN_COPY.phone.action}
                    loading={loading}
                    style={ctaButtonStyle}
                  />

                  <p className="login-helper">{LOGIN_COPY.phone.helper}</p>
                </form>

                <button type="button" className="login-secondary-action" onClick={onOpenRestaurantSignup}>
                  Register a restaurant
                </button>
              </div>
            )}

            {step === AUTH_STEP.OTP && (
              <div className="login-step">
                <div className="login-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M12 2l8 4v5c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4Z" /><path d="M9 12l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </div>
                <span className="login-kicker">{LOGIN_COPY.otp.kicker}</span>
                <h2>{LOGIN_COPY.otp.title}</h2>
                <p className="login-subtitle">
                  {LOGIN_COPY.otp.subtitle}{' '}
                  <strong>
                    {NEPAL_COUNTRY_CODE} {phone}
                  </strong>
                  .
                </p>

                <form onSubmit={handleOtpSubmit}>
                  <div className="login-otp-inputs" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        id={`otp-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        autoFocus={index === 0}
                        onChange={(event) => handleOtpChange(index, event.target.value)}
                        onKeyDown={(event) => handleOtpKeyDown(index, event)}
                        aria-label={`Verification digit ${index + 1}`}
                      />
                    ))}
                  </div>

                  <Button
                    type="submit"
                    title={loading ? 'Verifying...' : LOGIN_COPY.otp.action}
                    disabled={loading}
                    style={ctaButtonStyle}
                  />

                  <p className="login-resend">
                    {LOGIN_COPY.otp.resendLead}{' '}
                    <button type="button" onClick={handleResend}>
                      {LOGIN_COPY.otp.resendAction}
                    </button>
                  </p>
                </form>
              </div>
            )}

            {step === AUTH_STEP.SIGNUP && (
              <div className="login-step">
                <div className="login-step-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-7 8-7s8 3 8 7" strokeLinecap="round" /></svg>
                </div>
                <span className="login-kicker">{LOGIN_COPY.signup.kicker}</span>
                <h2>{LOGIN_COPY.signup.title}</h2>
                <p className="login-subtitle">{LOGIN_COPY.signup.subtitle}</p>

                <form onSubmit={handleSignupSubmit}>
                  <Input
                    label={LOGIN_COPY.signup.fullNameLabel}
                    placeholder={LOGIN_COPY.signup.fullNamePlaceholder}
                    value={fullName}
                    onChangeText={setFullName}
                    inputStyle={phoneInputTextStyle}
                    autoComplete="name"
                    required
                    style={authFieldStyle}
                  />

                  <Input
                    label={LOGIN_COPY.signup.emailLabel}
                    type="email"
                    placeholder={LOGIN_COPY.signup.emailPlaceholder}
                    value={email}
                    onChangeText={setEmail}
                    inputStyle={phoneInputTextStyle}
                    autoComplete="email"
                    required
                    style={authFieldStyle}
                  />

                  <Input
                    label={LOGIN_COPY.signup.dobLabel}
                    type="date"
                    placeholder={LOGIN_COPY.signup.dobPlaceholder}
                    value={dob}
                    onChangeText={setDob}
                    inputStyle={phoneInputTextStyle}
                    required
                    style={authFieldStyle}
                  />

                  <Button
                    type="submit"
                    title={loading ? 'Creating account...' : LOGIN_COPY.signup.action}
                    loading={loading}
                    style={ctaButtonStyle}
                  />

                  <p className="login-helper">{LOGIN_COPY.signup.disclaimer}</p>
                </form>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
