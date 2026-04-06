import { useCallback, useMemo, useState } from 'react';
import {
  completeSignupProfile,
  sendPhoneOtp,
  verifyOtpAndSyncProfile,
} from '@repo/api';
import {
  AUTH_FALLBACK_ERRORS,
  AUTH_OTP_LENGTH,
  AUTH_STEP,
  hasMinDigits,
  onlyDigits,
  toNepalE164Phone,
} from '@repo/utils';

function createOtpArray() {
  return Array(AUTH_OTP_LENGTH).fill('');
}

export function usePhoneAuthFlow({
  supabase,
  onAuthenticated,
  onFlowComplete,
} = {}) {
  const [step, setStep] = useState(AUTH_STEP.PHONE);
  const [phone, setPhone] = useState('');
  const [otpDigits, setOtpDigits] = useState(createOtpArray);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [dob, setDob] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const otpCode = useMemo(() => otpDigits.join(''), [otpDigits]);

  const resetFlow = useCallback(() => {
    setStep(AUTH_STEP.PHONE);
    setPhone('');
    setOtpDigits(createOtpArray());
    setFullName('');
    setEmail('');
    setDob('');
    setError('');
    setLoading(false);
  }, []);

  const goBack = useCallback(() => {
    setError('');

    if (step === AUTH_STEP.PHONE) {
      return false;
    }

    setStep((prev) => Math.max(AUTH_STEP.PHONE, prev - 1));
    return true;
  }, [step]);

  const setOtpDigit = useCallback((index, value) => {
    const digit = onlyDigits(value).slice(-1);

    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });

    return digit;
  }, []);

  const setOtpCode = useCallback((value) => {
    const digits = onlyDigits(value).slice(0, AUTH_OTP_LENGTH).split('');
    const nextOtp = createOtpArray();

    digits.forEach((digit, index) => {
      nextOtp[index] = digit;
    });

    setOtpDigits(nextOtp);
  }, []);

  const submitPhone = useCallback(async () => {
    if (!supabase) {
      setError('Supabase client is not available.');
      return { ok: false };
    }

    if (!hasMinDigits(phone, 6)) {
      setError(AUTH_FALLBACK_ERRORS.invalidPhone);
      return { ok: false };
    }

    setLoading(true);
    setError('');

    try {
      const fullPhone = toNepalE164Phone(phone);
      const { error: otpError } = await sendPhoneOtp(supabase, fullPhone);

      if (otpError) {
        setError(otpError.message || AUTH_FALLBACK_ERRORS.sendOtp);
        return { ok: false, error: otpError };
      }

      setStep(AUTH_STEP.OTP);
      return { ok: true };
    } catch (_err) {
      setError(AUTH_FALLBACK_ERRORS.sendOtp);
      return { ok: false };
    } finally {
      setLoading(false);
    }
  }, [phone, supabase]);

  const submitOtp = useCallback(
    async ({ token } = {}) => {
      if (!supabase) {
        setError('Supabase client is not available.');
        return { ok: false };
      }

      const code = onlyDigits(token || otpCode).slice(0, AUTH_OTP_LENGTH);

      if (code.length < AUTH_OTP_LENGTH) {
        setError(AUTH_FALLBACK_ERRORS.invalidOtp);
        return { ok: false };
      }

      setLoading(true);
      setError('');

      try {
        const fullPhone = toNepalE164Phone(phone);
        const { data, error: verifyError } = await verifyOtpAndSyncProfile(supabase, {
          phone: fullPhone,
          token: code,
        });

        if (verifyError) {
          setError(verifyError.message || AUTH_FALLBACK_ERRORS.verifyOtp);
          return { ok: false, error: verifyError };
        }

        if (data?.session && data?.needsSignup) {
          setStep(AUTH_STEP.SIGNUP);
          return { ok: true, needsSignup: true };
        }

        if (data?.session) {
          onAuthenticated?.(data.session);
          onFlowComplete?.({ type: 'authenticated', session: data.session });
          return { ok: true, needsSignup: false };
        }

        setError(AUTH_FALLBACK_ERRORS.verifyOtpUnknown);
        return { ok: false };
      } catch (_err) {
        setError(AUTH_FALLBACK_ERRORS.verifyOtp);
        return { ok: false };
      } finally {
        setLoading(false);
      }
    },
    [onAuthenticated, onFlowComplete, otpCode, phone, supabase],
  );

  const submitSignup = useCallback(async () => {
    if (!supabase) {
      setError('Supabase client is not available.');
      return { ok: false };
    }

    setLoading(true);
    setError('');

    try {
      const fullPhone = toNepalE164Phone(phone);
      const { error: signupError } = await completeSignupProfile(supabase, {
        phone: fullPhone,
        full_name: fullName,
        email,
        date_of_birth: dob,
      });

      if (signupError) {
        setError(signupError.message || AUTH_FALLBACK_ERRORS.signup);
        return { ok: false, error: signupError };
      }

      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        onAuthenticated?.(data.session);
      }

      onFlowComplete?.({ type: 'signup_complete', session: data?.session || null });
      return { ok: true };
    } catch (_err) {
      setError(AUTH_FALLBACK_ERRORS.signup);
      return { ok: false };
    } finally {
      setLoading(false);
    }
  }, [dob, email, fullName, onAuthenticated, onFlowComplete, phone, supabase]);

  const resendOtp = useCallback(async () => {
    if (!supabase) {
      setError('Supabase client is not available.');
      return { ok: false };
    }

    setLoading(true);
    setError('');

    try {
      const fullPhone = toNepalE164Phone(phone);
      const { error: resendError } = await sendPhoneOtp(supabase, fullPhone);

      if (resendError) {
        setError(resendError.message || AUTH_FALLBACK_ERRORS.resend);
        return { ok: false, error: resendError };
      }

      return { ok: true };
    } catch (_err) {
      setError(AUTH_FALLBACK_ERRORS.resend);
      return { ok: false };
    } finally {
      setLoading(false);
    }
  }, [phone, supabase]);

  return {
    step,
    setStep,
    phone,
    setPhone,
    otpDigits,
    otpCode,
    setOtpDigits,
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
    setError,
    resetFlow,
    goBack,
    submitPhone,
    submitOtp,
    submitSignup,
    resendOtp,
  };
}
