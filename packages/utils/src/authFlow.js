export const AUTH_STEP = {
  PHONE: 1,
  OTP: 2,
  SIGNUP: 3,
};

export const AUTH_COPY = {
  intro: {
    title: 'Food delivered\naround Kathmandu',
    subtitle: 'Browse restaurants, track orders, and manage deliveries from one simple app.',
    cta: 'Get started',
  },
  phone: {
    title: 'Welcome back',
    subtitle: 'Enter your phone number to continue.',
    action: 'Continue',
    alternate: 'Other login method',
  },
  otp: {
    title: 'Verify your number',
    subtitle: 'Enter the code sent to your phone.',
    action: 'Verify',
    resendLead: "Didn't get the code?",
    resendAction: 'Resend',
  },
  signup: {
    title: 'Create your profile',
    subtitle: 'Add your details for delivery updates.',
    action: 'Sign up',
    fullNameLabel: 'Full name',
    emailLabel: 'Email',
    dobLabel: 'Date of birth',
    fullNamePlaceholder: 'User For Testing',
    emailPlaceholder: 'user@gmail.com',
    dobPlaceholder: '1-11-2004',
    disclaimer: 'By signing up you are agreeing to the terms of service.',
  },
  common: {
    or: 'OR',
  },
};

export const AUTH_FALLBACK_ERRORS = {
  invalidPhone: 'Please enter a valid phone number.',
  invalidOtp: 'Please enter the 6-digit code.',
  sendOtp: 'Failed to send OTP. Please try again.',
  verifyOtp: 'Verification failed. Please try again.',
  verifyOtpUnknown: 'Could not verify the code. Please try again.',
  signup: 'Signup failed. Please try again.',
  resend: 'Failed to resend OTP.',
};
