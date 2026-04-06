import { useEffect } from 'react'
import {
  AUTH_COPY,
  AUTH_THEME,
  AUTH_OTP_LENGTH,
  AUTH_STEP,
  NEPAL_COUNTRY_CODE,
  onlyDigits,
} from '@repo/utils'
import { Button, Input, usePhoneAuthFlow } from '@repo/ui'
import './LoginPopup.css'

const AUTH_COLORS = AUTH_THEME.colors
const AUTH_RADII = AUTH_THEME.radii
const AUTH_SIZES = AUTH_THEME.sizes

const phoneInputStyle = {
  background: '#f4e5d8',
  border: `3px solid ${AUTH_COLORS.brand}`,
  borderRadius: `${AUTH_RADII.field}px`,
  minHeight: `${AUTH_SIZES.inputHeight}px`,
  padding: '0 22px',
}

const phoneInputTextStyle = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#1E1E1E',
}

const phonePrefixStyle = {
  fontSize: '1.5rem',
  fontWeight: 700,
  color: '#5E5E5E',
}

const signupInputStyle = {
  background: '#f4e5d8',
  border: `3px solid ${AUTH_COLORS.brand}`,
  borderRadius: `${AUTH_RADII.field}px`,
  minHeight: `${AUTH_SIZES.inputHeight}px`,
  padding: '0 18px',
}

const signupInputTextStyle = {
  fontSize: '1.24rem',
  fontWeight: 700,
  color: '#1E1E1E',
}

const ctaButtonStyle = {
  width: '100%',
  minHeight: `${AUTH_SIZES.buttonHeight}px`,
  borderRadius: `${AUTH_RADII.field}px`,
  fontSize: '1.35rem',
  fontWeight: 800,
  backgroundColor: AUTH_COLORS.brand,
  borderColor: AUTH_COLORS.brand,
  color: AUTH_COLORS.surface,
  boxShadow: 'none',
}

const outlineButtonStyle = {
  width: '100%',
  minHeight: `${AUTH_SIZES.buttonHeight}px`,
  borderRadius: `${AUTH_RADII.field}px`,
  fontSize: '1.25rem',
  fontWeight: 700,
}

const authCssVars = {
  '--auth-brand': AUTH_COLORS.brand,
  '--auth-canvas': AUTH_COLORS.canvas,
  '--auth-surface': AUTH_COLORS.surface,
  '--auth-ink': AUTH_COLORS.ink,
}

export default function LoginPopup({ isOpen, onClose, supabase, onAuthenticated }) {
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
    onFlowComplete: () => onClose?.(),
  })

  useEffect(() => {
    if (isOpen) {
      resetFlow()
    }
  }, [isOpen, resetFlow])

  if (!isOpen) {
    return null
  }

  const handleTopBack = () => {
    const steppedBack = goBack()
    if (!steppedBack) {
      onClose()
    }
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
    <div
      className="auth-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Login popup"
      style={authCssVars}
    >
      <div className="auth-modal" onClick={(event) => event.stopPropagation()}>
        <button className="auth-nav-back" onClick={handleTopBack} aria-label="Go back">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
        </button>

        <div className="auth-content">
          {error && <p className="auth-error">{error}</p>}

          {step === AUTH_STEP.PHONE && (
            <div className="auth-step slide-in">
              <h1>{AUTH_COPY.phone.title}</h1>
              <p className="subtitle">{AUTH_COPY.phone.subtitle}</p>

              <form onSubmit={handlePhoneSubmit}>
                <Input
                  placeholder="1234567890"
                  value={phone}
                  onChangeText={setPhone}
                  inputMode="tel"
                  prefix={NEPAL_COUNTRY_CODE}
                  prefixStyle={phonePrefixStyle}
                  inputStyle={phoneInputTextStyle}
                  autoFocus
                  style={phoneInputStyle}
                />

                <Button
                  type="submit"
                  title={loading ? 'Sending...' : AUTH_COPY.phone.action}
                  loading={loading}
                  style={ctaButtonStyle}
                />

                <div className="auth-divider">
                  <span>{AUTH_COPY.common.or}</span>
                </div>

                <Button
                  type="button"
                  title={AUTH_COPY.phone.alternate}
                  variant="outline"
                  style={outlineButtonStyle}
                />
              </form>
            </div>
          )}

          {step === AUTH_STEP.OTP && (
            <div className="auth-step slide-in">
              <h1>{AUTH_COPY.otp.title}</h1>
              <p className="subtitle">{AUTH_COPY.otp.subtitle}</p>

              <form onSubmit={handleOtpSubmit}>
                <div className="otp-inputs" onPaste={handleOtpPaste}>
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
                    />
                  ))}
                </div>

                <Button
                  type="submit"
                  title={loading ? 'Verifying...' : AUTH_COPY.otp.action}
                  disabled={loading}
                  style={ctaButtonStyle}
                />

                <p className="resend-text">
                  {AUTH_COPY.otp.resendLead}{' '}
                  <strong onClick={handleResend}>{AUTH_COPY.otp.resendAction}</strong>
                </p>
              </form>
            </div>
          )}

          {step === AUTH_STEP.SIGNUP && (
            <div className="auth-step slide-in">
              <h1>{AUTH_COPY.signup.title}</h1>
              <p className="subtitle">{AUTH_COPY.signup.subtitle}</p>

              <form onSubmit={handleSignupSubmit} className="signup-form">
                <Input
                  label={AUTH_COPY.signup.fullNameLabel}
                  placeholder={AUTH_COPY.signup.fullNamePlaceholder}
                  value={fullName}
                  onChangeText={setFullName}
                  inputStyle={signupInputTextStyle}
                  required
                  style={signupInputStyle}
                />

                <Input
                  label={AUTH_COPY.signup.emailLabel}
                  type="email"
                  placeholder={AUTH_COPY.signup.emailPlaceholder}
                  value={email}
                  onChangeText={setEmail}
                  inputStyle={signupInputTextStyle}
                  required
                  style={signupInputStyle}
                />

                <Input
                  label={AUTH_COPY.signup.dobLabel}
                  type="date"
                  placeholder={AUTH_COPY.signup.dobPlaceholder}
                  value={dob}
                  onChangeText={setDob}
                  inputStyle={signupInputTextStyle}
                  className="signup-date-field"
                  required
                  style={signupInputStyle}
                />

                <Button
                  className="signup-submit"
                  type="submit"
                  title={loading ? 'Signing up...' : AUTH_COPY.signup.action}
                  loading={loading}
                  style={ctaButtonStyle}
                />

                <p className="signup-disclaimer">{AUTH_COPY.signup.disclaimer}</p>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
