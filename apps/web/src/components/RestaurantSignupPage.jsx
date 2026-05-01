import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  fetchOwnedRestaurant,
  sendEmailOtp,
  sendPhoneChangeOtp,
  submitRestaurantApplication,
  uploadRestaurantImage,
  verifyEmailOtp,
  verifyPhoneChangeOtp,
} from '@repo/api'
import { Button, Input, Logo } from '@repo/ui'
import { AUTH_OTP_LENGTH, onlyDigits, toNepalE164Phone } from '@repo/utils'
import './RestaurantSignupPage.css'
import GoogleAddressPicker from './GoogleAddressPicker'

const STEP = {
  DETAILS: 'details',
  EMAIL_OTP: 'email-otp',
  PHONE_OTP: 'phone-otp',
  LOCATION: 'location',
  IMAGE_CONFIRM: 'image-confirm',
  PENDING: 'pending',
  REJECTED: 'rejected',
}

const initialForm = {
  restaurantName: '',
  description: '',
  email: '',
  phone: '',
  location: '',
  formattedAddress: '',
  placeId: '',
  coordinates: null,
}

const formFieldStyle = {
  background: '#FFFFFF',
  border: '1px solid #EAEAEA',
  borderRadius: '10px',
  minHeight: '54px',
  padding: '0 16px',
}

const formInputTextStyle = {
  fontSize: '1rem',
  fontWeight: 600,
  color: '#1E1E1E',
}

const submitButtonStyle = {
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

function createOtpDigits(length = AUTH_OTP_LENGTH) {
  return Array(length).fill('')
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim())
}

function buildFormFromApplication(application) {
  if (!application) {
    return null
  }

  return {
    restaurantName: application.name || '',
    description: application.description || '',
    email: application.contact_email || '',
    phone: application.contact_phone || '',
    location: application.address || application.formatted_address || '',
    formattedAddress: application.formatted_address || application.address || '',
    placeId: application.google_place_id || '',
    coordinates: application.latitude && application.longitude
      ? { latitude: application.latitude, longitude: application.longitude }
      : null,
  }
}

export default function RestaurantSignupPage({
  supabase,
  session,
  onBack,
  onAuthenticated,
  onApplicationVerified,
}) {
  const initialEmail = session?.user?.email || session?.user?.user_metadata?.email || ''
  const [step, setStep] = useState(STEP.DETAILS)
  const [form, setForm] = useState(() => ({
    ...initialForm,
    email: initialEmail,
  }))
  const [profileImageFile, setProfileImageFile] = useState(null)
  const [bannerImageFile, setBannerImageFile] = useState(null)
  const [profilePreviewUrl, setProfilePreviewUrl] = useState('')
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState('')
  const [otpDigits, setOtpDigits] = useState(() => createOtpDigits(AUTH_OTP_LENGTH))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [application, setApplication] = useState(null)

  const refreshApplicationStatus = useCallback(async ({ showLoading = false } = {}) => {
    if (!supabase) {
      return null
    }

    let ownerId = session?.user?.id || ''

    if (!ownerId) {
      const { data } = await supabase.auth.getUser()
      ownerId = data?.user?.id || ''
    }

    if (!ownerId) {
      return null
    }

    if (showLoading) {
      setLoading(true)
      setError('')
    }

    try {
      const [
        { data: restaurant, error: restaurantError },
        { data: profile, error: profileError },
      ] = await Promise.all([
        fetchOwnedRestaurant(supabase, ownerId),
        supabase
          .from('user_profiles')
          .select('role, verification_status')
          .eq('id', ownerId)
          .maybeSingle(),
      ])

      if (restaurantError) {
        throw restaurantError
      }

      if (profileError) {
        throw profileError
      }

      const restaurantVerified = restaurant?.verification_status === 'verified'
      const ownerVerified = profile?.role === 'restaurant_owner' && profile?.verification_status === 'verified'

      if (restaurantVerified || ownerVerified) {
        onApplicationVerified?.()
        return restaurant || null
      }

      if (restaurant) {
        setApplication(restaurant)

        if (restaurant.verification_status === 'pending') {
          setStep(STEP.PENDING)
        } else if (restaurant.verification_status === 'rejected') {
          const nextForm = buildFormFromApplication(restaurant)
          if (nextForm) {
            setForm(nextForm)
          }
          setStep(STEP.REJECTED)
        }
      }

      return restaurant || null
    } catch (statusError) {
      if (showLoading) {
        setError(statusError.message || 'Could not check your restaurant status.')
      }
      return null
    } finally {
      if (showLoading) {
        setLoading(false)
      }
    }
  }, [onApplicationVerified, session, supabase])

  useEffect(() => {
    async function loadExistingApplication() {
      if (!supabase || !session?.user?.id) {
        return
      }

      await refreshApplicationStatus()
    }

    loadExistingApplication()
  }, [refreshApplicationStatus, session?.user?.id, supabase])

  const activeOtpLength = AUTH_OTP_LENGTH
  const activeOtpPrefix = step === STEP.EMAIL_OTP ? 'restaurant-email-otp' : 'restaurant-phone-otp'
  const otpCode = otpDigits.join('')

  const payload = useMemo(() => ({
    restaurantName: String(form.restaurantName || '').trim(),
    description: String(form.description || '').trim(),
    email: String(form.email || '').trim(),
    phone: String(form.phone || '').trim(),
    location: String(form.location || '').trim(),
    formattedAddress: String(form.formattedAddress || form.location || '').trim(),
    placeId: String(form.placeId || '').trim(),
    coordinates: form.coordinates || null,
  }), [form])

  const handleChange = (field) => (value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))

    if (error) {
      setError('')
    }
  }

  useEffect(() => {
    return () => {
      if (profilePreviewUrl) {
        URL.revokeObjectURL(profilePreviewUrl)
      }
      if (bannerPreviewUrl) {
        URL.revokeObjectURL(bannerPreviewUrl)
      }
    }
  }, [bannerPreviewUrl, profilePreviewUrl])

  const validateDetails = () => {
    if (!payload.restaurantName || !payload.description || !payload.email || !payload.phone) {
      return 'Add your restaurant name, bio, email, and phone number.'
    }

    if (payload.description.length < 8) {
      return 'Add a short restaurant bio.'
    }

    if (!isValidEmail(payload.email)) {
      return 'Enter a valid email address.'
    }

    if (onlyDigits(payload.phone).length < 6) {
      return 'Enter a valid phone number.'
    }

    return ''
  }

  const validateLocation = () => {
    if (!payload.location) {
      return 'Add your restaurant location.'
    }

    return ''
  }

  const handleDetailsSubmit = async (event) => {
    event.preventDefault()

    const validationError = validateDetails()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    setError('')

    const { error: otpError } = await sendEmailOtp(supabase, payload.email)

    if (otpError) {
      setError(otpError.message || 'Could not send the email verification code.')
    } else {
      setOtpDigits(createOtpDigits(AUTH_OTP_LENGTH))
      setStep(STEP.EMAIL_OTP)
    }

    setLoading(false)
  }

  const handleLocationSubmit = (event) => {
    event.preventDefault()

    const validationError = validateLocation()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setStep(STEP.IMAGE_CONFIRM)
  }

  const handleImageFileChange = (kind) => (event) => {
    const file = event.target.files?.[0] || null
    const currentPreviewUrl = kind === 'profile' ? profilePreviewUrl : bannerPreviewUrl
    const setFile = kind === 'profile' ? setProfileImageFile : setBannerImageFile
    const setPreviewUrl = kind === 'profile' ? setProfilePreviewUrl : setBannerPreviewUrl

    if (!file) {
      setFile(null)
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl)
      }
      setPreviewUrl('')
      return
    }

    if (!file.type?.startsWith('image/')) {
      setError('Upload an image file.')
      event.target.value = ''
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Upload an image smaller than 5 MB.')
      event.target.value = ''
      return
    }

    if (currentPreviewUrl) {
      URL.revokeObjectURL(currentPreviewUrl)
    }

    setFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setError('')
  }

  const handleEmailOtpSubmit = async (event) => {
    event.preventDefault()

    if (otpCode.length < AUTH_OTP_LENGTH) {
      setError('Enter the 6-digit email code.')
      return
    }

    setLoading(true)
    setError('')

    const { data: authData, error: verifyError } = await verifyEmailOtp(
      supabase,
      payload.email,
      otpCode,
    )

    if (verifyError) {
      setError(verifyError.message || 'Could not verify the email code.')
      setLoading(false)
      return
    }

    if (authData?.session) {
      await supabase.auth.setSession({
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      })
      onAuthenticated?.(authData.session)
    }

    const { error: phoneError } = await sendPhoneChangeOtp(supabase, toNepalE164Phone(payload.phone))

    if (phoneError) {
      setError(phoneError.message || 'Could not send the phone verification code.')
      setLoading(false)
      return
    }

    setOtpDigits(createOtpDigits(AUTH_OTP_LENGTH))
    setStep(STEP.PHONE_OTP)
    setLoading(false)
  }

  const setOtpDigit = (index, value) => {
    const digit = onlyDigits(value).slice(-1)

    setOtpDigits((current) => {
      const next = [...current]
      next[index] = digit
      return next
    })

    if (digit && index < activeOtpLength - 1) {
      document.getElementById(`${activeOtpPrefix}-${index + 1}`)?.focus()
    }
  }

  const handleOtpKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) {
      document.getElementById(`${activeOtpPrefix}-${index - 1}`)?.focus()
    }
  }

  const handleOtpPaste = (event) => {
    const pasted = onlyDigits(event.clipboardData.getData('text')).slice(0, activeOtpLength)

    if (!pasted) {
      return
    }

    event.preventDefault()
    const nextOtp = createOtpDigits(activeOtpLength)
    pasted.split('').forEach((digit, index) => {
      nextOtp[index] = digit
    })
    setOtpDigits(nextOtp)
  }

  const handlePhoneOtpSubmit = async (event) => {
    event.preventDefault()

    if (otpCode.length < AUTH_OTP_LENGTH) {
      setError('Enter the 6-digit phone code.')
      return
    }

    setLoading(true)
    setError('')

    const { data: authData, error: verifyError } = await verifyPhoneChangeOtp(
      supabase,
      toNepalE164Phone(payload.phone),
      otpCode,
    )

    if (verifyError) {
      setError(verifyError.message || 'Could not verify the phone code.')
      setLoading(false)
      return
    }

    if (authData?.session) {
      await supabase.auth.setSession({
        access_token: authData.session.access_token,
        refresh_token: authData.session.refresh_token,
      })
      onAuthenticated?.(authData.session)
    }

    setStep(STEP.LOCATION)
    setLoading(false)
  }

  const handleConfirmSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    const { data: applicationData, error: submitError } = await submitRestaurantApplication(
      supabase,
      payload,
    )

    if (submitError) {
      setError(submitError.message || 'Could not submit your restaurant application.')
      setLoading(false)
      return
    }

    let nextApplication = applicationData

    const { data: userData } = await supabase.auth.getUser()
    const ownerId = userData?.user?.id
    const uploadTasks = [
      profileImageFile ? ['profile', profileImageFile] : null,
      bannerImageFile ? ['banner', bannerImageFile] : null,
    ].filter(Boolean)

    for (const [kind, file] of uploadTasks) {
      const { data: imageData, error: imageError } = await uploadRestaurantImage(
        supabase,
        ownerId,
        applicationData.id,
        file,
        kind,
      )

      if (imageError) {
        setError('Application submitted, but one image upload failed. You can update it after approval.')
      } else if (imageData?.url && kind === 'banner') {
        nextApplication = {
          ...nextApplication,
          image_url: imageData.url,
          banner_url: imageData.url,
        }
      } else if (imageData?.url && kind === 'profile') {
        nextApplication = {
          ...nextApplication,
          profile_image_url: imageData.url,
        }
      }
    }

    setApplication(nextApplication)
    setStep(STEP.PENDING)
    setLoading(false)
  }

  const handleResendCode = async () => {
    setLoading(true)
    setError('')

    const { error: otpError } = step === STEP.EMAIL_OTP
      ? await sendEmailOtp(supabase, payload.email)
      : await sendPhoneChangeOtp(supabase, toNepalE164Phone(payload.phone))

    if (otpError) {
      setError(otpError.message || 'Could not resend the verification code.')
    }

    setLoading(false)
  }

  const handleCheckStatus = async () => {
    await refreshApplicationStatus({ showLoading: true })
  }

  const handleEditRejectedApplication = () => {
    const nextForm = buildFormFromApplication(application)
    if (nextForm) {
      setForm(nextForm)
    }
    setError('')
    setOtpDigits(createOtpDigits(AUTH_OTP_LENGTH))
    setStep(STEP.DETAILS)
  }

  return (
    <main className="restaurant-signup-shell">
      <nav className="restaurant-signup-nav">
        <div className="container restaurant-signup-nav-inner">
          <button type="button" className="restaurant-signup-nav-brand" onClick={onBack}>
            <img src={Logo} alt="Chito Mitho logo" />
            <span>Chito Mitho</span>
          </button>

          <div className="restaurant-signup-nav-actions">
            <button type="button" className="btn btn-outline" onClick={onBack}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16" aria-hidden="true" style={{display:'inline',verticalAlign:'middle',marginRight:'4px'}}><path d="M15 18l-6-6 6-6" /></svg>
              Back to Home
            </button>
          </div>
        </div>
      </nav>

      <section className="restaurant-signup-hero">
        <div className="container restaurant-signup-layout">
          <div className="restaurant-signup-story">
            <span className="section-tag">Restaurant Registration</span>
            <h1>
              {step === STEP.PENDING
                ? 'Application pending.'
                : step === STEP.REJECTED
                  ? 'Application needs updates.'
                  : 'Register your restaurant.'}
            </h1>
            <p className="restaurant-signup-lead">
              {step === STEP.PENDING
                ? 'Your details are in review. Dashboard access opens after admin verification.'
                : step === STEP.REJECTED
                  ? 'Review the admin reason, update your details, and submit again.'
                : 'Submit your details, review the public profile, and verify your phone.'}
            </p>
            <div className="restaurant-signup-feature-grid" aria-hidden="true">
              <article>
                <span className="restaurant-signup-feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 21s-7-5.5-7-10a7 7 0 1114 0c0 4.5-7 10-7 10z" /><circle cx="12" cy="11" r="2.5" /></svg>
                </span>
                <strong>Precise location</strong>
                <span>Search or pin the restaurant address.</span>
              </article>
              <article>
                <span className="restaurant-signup-feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h3" /></svg>
                </span>
                <strong>Menu ready</strong>
                <span>Approval opens the owner dashboard.</span>
              </article>
              <article>
                <span className="restaurant-signup-feature-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M9 11a3 3 0 106 0 3 3 0 00-6 0z" /><path d="M12.9 21.4a1 1 0 01-1.8 0l-5.7-9.9A7 7 0 0119.6 11l-6.7 10.4z" /></svg>
                </span>
                <strong>Verified owner</strong>
                <span>Phone login keeps your dashboard reachable.</span>
              </article>
            </div>
          </div>

          <div className="restaurant-signup-card">
            {step === STEP.DETAILS && (
              <>
                <div className="restaurant-signup-card-head">
                  <span className="restaurant-signup-card-kicker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h6M9 11h6M9 15h3" /></svg> Step 1 of 5</span>
                  <h2>Restaurant details</h2>
                  <p>Add the owner contact and customer-facing bio.</p>
                </div>

                <form className="restaurant-signup-form" onSubmit={handleDetailsSubmit}>
                  <Input
                    label="Restaurant Name"
                    placeholder="Momo Station"
                    value={form.restaurantName}
                    onChangeText={handleChange('restaurantName')}
                    autoComplete="organization"
                    inputStyle={formInputTextStyle}
                    style={formFieldStyle}
                    required
                  />

                  <label className="restaurant-signup-textarea-field">
                    <span>Restaurant Bio</span>
                    <textarea
                      placeholder="Family-run momo, thali, and snacks near Baneshwor."
                      value={form.description}
                      onChange={(event) => handleChange('description')(event.target.value)}
                      required
                    />
                  </label>

                  <Input
                    label="Email"
                    placeholder="owner@example.com"
                    value={form.email}
                    onChangeText={handleChange('email')}
                    type="email"
                    autoComplete="email"
                    inputStyle={formInputTextStyle}
                    style={formFieldStyle}
                    required
                  />

                  <Input
                    label="Phone Number (+977)"
                    placeholder="98XXXXXXXX"
                    value={form.phone}
                    onChangeText={handleChange('phone')}
                    type="tel"
                    inputMode="tel"
                    maxLength={10}
                    autoComplete="tel"
                    inputStyle={formInputTextStyle}
                    style={formFieldStyle}
                    required
                  />

                  {error ? (
                    <div className="restaurant-signup-notice restaurant-signup-notice-error">
                      {error}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    loading={loading}
                    title={loading ? 'Sending email code...' : 'Verify email'}
                    style={submitButtonStyle}
                  />
                </form>
              </>
            )}

            {step === STEP.EMAIL_OTP && (
              <>
                <div className="restaurant-signup-card-head">
                  <span className="restaurant-signup-card-kicker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m2 7 10 7 10-7" /></svg> Step 2 of 5</span>
                  <h2>Verify email</h2>
                  <p>Enter the 6-digit code sent to {payload.email}.</p>
                </div>

                <form className="restaurant-signup-form" onSubmit={handleEmailOtpSubmit}>
                  <div className="restaurant-signup-otp-inputs" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        id={`restaurant-email-otp-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        autoFocus={index === 0}
                        onChange={(event) => setOtpDigit(index, event.target.value)}
                        onKeyDown={(event) => handleOtpKeyDown(index, event)}
                        aria-label={`Email verification digit ${index + 1}`}
                      />
                    ))}
                  </div>

                  {error ? (
                    <div className="restaurant-signup-notice restaurant-signup-notice-error">
                      {error}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    loading={loading}
                    title={loading ? 'Verifying email...' : 'Verify email'}
                    style={submitButtonStyle}
                  />

                  <button
                    type="button"
                    className="restaurant-signup-text-button"
                    onClick={handleResendCode}
                    disabled={loading}
                  >
                    Resend code
                  </button>
                </form>
              </>
            )}

            {step === STEP.PHONE_OTP && (
              <>
                <div className="restaurant-signup-card-head">
                  <span className="restaurant-signup-card-kicker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 8h20M8 12h3" /></svg> Step 3 of 5</span>
                  <h2>Verify phone</h2>
                  <p>Enter the 6-digit code sent to {toNepalE164Phone(payload.phone)}.</p>
                </div>

                <form className="restaurant-signup-form" onSubmit={handlePhoneOtpSubmit}>
                  <div className="restaurant-signup-otp-inputs" onPaste={handleOtpPaste}>
                    {otpDigits.map((digit, index) => (
                      <input
                        key={index}
                        id={`restaurant-phone-otp-${index}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        autoFocus={index === 0}
                        onChange={(event) => setOtpDigit(index, event.target.value)}
                        onKeyDown={(event) => handleOtpKeyDown(index, event)}
                        aria-label={`Phone verification digit ${index + 1}`}
                      />
                    ))}
                  </div>

                  {error ? (
                    <div className="restaurant-signup-notice restaurant-signup-notice-error">
                      {error}
                    </div>
                  ) : null}

                  <Button
                    type="submit"
                    loading={loading}
                    title={loading ? 'Verifying phone...' : 'Verify phone'}
                    style={submitButtonStyle}
                  />

                  <button
                    type="button"
                    className="restaurant-signup-text-button"
                    onClick={handleResendCode}
                    disabled={loading}
                  >
                    Resend code
                  </button>
                </form>
              </>
            )}

            {step === STEP.LOCATION && (
              <>
                <div className="restaurant-signup-card-head">
                  <span className="restaurant-signup-card-kicker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true"><path d="M12 21s-7-5.5-7-10a7 7 0 1114 0c0 4.5-7 10-7 10z" /><circle cx="12" cy="11" r="2.5" /></svg> Step 4 of 5</span>
                  <h2>Pick location</h2>
                  <p>Select a location, then open the map preview to confirm the exact pin.</p>
                </div>

                <form className="restaurant-signup-form" onSubmit={handleLocationSubmit}>
                  <GoogleAddressPicker
                    label="Location"
                    placeholder="Baneshwor, Kathmandu"
                    value={form.location}
                    coordinates={form.coordinates}
                    onChange={(nextLocation) => {
                      setForm((current) => ({
                        ...current,
                        location: nextLocation.address,
                        formattedAddress: nextLocation.formattedAddress,
                        placeId: nextLocation.placeId,
                        coordinates: nextLocation.coordinates,
                      }))
                      if (error) {
                        setError('')
                      }
                    }}
                  />

                  {error ? (
                    <div className="restaurant-signup-notice restaurant-signup-notice-error">
                      {error}
                    </div>
                  ) : null}

                  <div className="restaurant-signup-action-row">
                    <button type="button" className="restaurant-signup-back-button" onClick={() => setStep(STEP.PHONE_OTP)}>
                      Back
                    </button>
                    <Button type="submit" title="Continue" style={submitButtonStyle} />
                  </div>
                </form>
              </>
            )}

            {step === STEP.IMAGE_CONFIRM && (
              <>
                <div className="restaurant-signup-card-head">
                  <span className="restaurant-signup-card-kicker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 15l-4.5-4.5L11 16l-2-2-4 4" /></svg> Step 5 of 5</span>
                  <h2>Preview profile</h2>
                  <p>Add a profile photo and banner, then confirm the restaurant profile.</p>
                </div>

                <form className="restaurant-signup-form" onSubmit={handleConfirmSubmit}>
                  <div className="restaurant-signup-upload-grid">
                    <label className="restaurant-signup-upload">
                      <span>Profile photo</span>
                      <input type="file" accept="image/*" onChange={handleImageFileChange('profile')} />
                      <strong>{profileImageFile ? profileImageFile.name : 'Add a photo'}</strong>
                    </label>

                    <label className="restaurant-signup-upload">
                      <span>Banner</span>
                      <input type="file" accept="image/*" onChange={handleImageFileChange('banner')} />
                      <strong>{bannerImageFile ? bannerImageFile.name : 'Update banner'}</strong>
                    </label>
                  </div>

                  <div className="restaurant-signup-preview-card">
                    <div className="restaurant-signup-preview-banner">
                      {bannerPreviewUrl ? <img src={bannerPreviewUrl} alt="" /> : <span>Banner preview</span>}
                    </div>
                    <div className="restaurant-signup-preview-body">
                      <div className="restaurant-signup-preview-avatar">
                        {profilePreviewUrl ? <img src={profilePreviewUrl} alt="" /> : <span>{payload.restaurantName.slice(0, 1).toUpperCase()}</span>}
                      </div>
                      <div className="restaurant-signup-preview-copy">
                        <h3>{payload.restaurantName}</h3>
                        <p>{payload.description}</p>
                        <dl>
                          <div><dt>Email</dt><dd>{payload.email}</dd></div>
                          <div><dt>Phone</dt><dd>{toNepalE164Phone(payload.phone)}</dd></div>
                          <div><dt>Location</dt><dd>{payload.formattedAddress || payload.location}</dd></div>
                        </dl>
                      </div>
                    </div>
                  </div>

                  {error ? (
                    <div className="restaurant-signup-notice restaurant-signup-notice-error">
                      {error}
                    </div>
                  ) : null}

                  <div className="restaurant-signup-action-row">
                    <button type="button" className="restaurant-signup-back-button" onClick={() => setStep(STEP.LOCATION)}>
                      Back
                    </button>
                    <Button
                      type="submit"
                      loading={loading}
                      title={loading ? 'Submitting...' : 'Confirm and submit'}
                      style={submitButtonStyle}
                    />
                  </div>
                </form>
              </>
            )}

            {step === STEP.PENDING && (
              <div className="restaurant-signup-pending">
                <span className="restaurant-signup-card-kicker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg> Pending review</span>
                <h2>{application?.name || payload.restaurantName || 'Restaurant application'}</h2>
                <p>
                  Your application is waiting for admin verification. You will see the restaurant dashboard
                  after approval.
                </p>

                {error ? (
                  <div className="restaurant-signup-notice restaurant-signup-notice-error">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="button"
                  loading={loading}
                  title={loading ? 'Checking...' : 'Check status'}
                  style={submitButtonStyle}
                  onClick={handleCheckStatus}
                />
              </div>
            )}

            {step === STEP.REJECTED && (
              <div className="restaurant-signup-pending restaurant-signup-rejected">
                <span className="restaurant-signup-card-kicker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></svg> Updates required</span>
                <h2>{application?.name || payload.restaurantName || 'Restaurant application'}</h2>
                <p>
                  Admin could not verify this application yet. Fix the issue below and submit the application again.
                </p>
                <div className="restaurant-signup-notice restaurant-signup-notice-error">
                  {application?.rejection_reason || 'No rejection reason was provided.'}
                </div>

                {error ? (
                  <div className="restaurant-signup-notice restaurant-signup-notice-error">
                    {error}
                  </div>
                ) : null}

                <Button
                  type="button"
                  title="Update application"
                  style={submitButtonStyle}
                  onClick={handleEditRejectedApplication}
                />
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  )
}
