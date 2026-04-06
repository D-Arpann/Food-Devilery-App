export const AUTH_STEP = {
  PHONE: 1,
  OTP: 2,
  SIGNUP: 3,
};

export const AUTH_COPY = {
  intro: {
    title: "Hungry?\nWe're on it",
    subtitle: "Because the fridge isn't going to\napologize and improve.",
    cta: 'Get started',
  },
  phone: {
    title: 'Time to eat',
    subtitle: 'Your number is the secret ingredient.',
    action: 'Continue',
    alternate: 'Other login method',
  },
  otp: {
    title: 'Check your texts',
    subtitle: 'Pop in the code from your messages.',
    action: 'Verify',
    resendLead: "Didn't get the code?",
    resendAction: 'Resend',
  },
  signup: {
    title: 'First rodeo?',
    subtitle: 'Welcome to the cool table.',
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
  invalidOtp: 'Please enter the 4-digit code.',
  sendOtp: 'Failed to send OTP. Please try again.',
  verifyOtp: 'Verification failed. Please try again.',
  verifyOtpUnknown: 'Could not verify the code. Please try again.',
  signup: 'Signup failed. Please try again.',
  resend: 'Failed to resend OTP.',
};
