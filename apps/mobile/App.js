import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFonts } from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { createAppClient, logout } from '@repo/api';
import { Input, usePhoneAuthFlow } from '@repo/ui';
import {
  AUTH_COPY,
  AUTH_THEME,
  AUTH_OTP_LENGTH,
  AUTH_STEP,
  NEPAL_COUNTRY_CODE,
  SUPABASE_DEFAULTS,
} from '@repo/utils';
import './global.css';

const supabase = createAppClient({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_DEFAULTS.URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_DEFAULTS.ANON_KEY,
});
const BRAND_LOGO = require('./assets/splash-icon.png');
const DESIGN_WIDTH = 402;
const SCREEN_WIDTH = Dimensions.get('window').width;
const SCALE = Math.min(SCREEN_WIDTH / DESIGN_WIDTH, 1);
const s = (value) => Math.round(value * SCALE);
const FONT_REGULAR = 'Outfit_400Regular';
const FONT_MEDIUM = 'Outfit_500Medium';
const FONT_SEMIBOLD = 'Outfit_600SemiBold';
const FONT_BOLD = 'Outfit_700Bold';
const FONT_EXTRABOLD = 'Outfit_800ExtraBold';
const AUTH_COLORS = AUTH_THEME.colors;
const AUTH_RADII = AUTH_THEME.radii;
const AUTH_SIZES = AUTH_THEME.sizes;

function BackButton({ onPress, topInset = 0 }) {
  return (
    <Pressable onPress={onPress} style={[styles.backButton, { top: topInset + s(26) }]}>
      <Ionicons name="arrow-back" size={s(21)} color="#FFFFFF" />
    </Pressable>
  );
}

function ActionButton({
  title,
  onPress,
  variant = 'filled',
  loading = false,
  disabled = false,
  style,
  textStyle,
}) {
  const isDisabled = loading || disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      style={[
        styles.actionButtonBase,
        variant === 'outline' ? styles.actionButtonOutline : styles.actionButtonFilled,
        isDisabled && styles.actionButtonDisabled,
        style,
      ]}
    >
      <Text
        style={[
          styles.actionButtonTextBase,
          variant === 'outline' ? styles.actionButtonTextOutline : styles.actionButtonTextFilled,
          textStyle,
        ]}
      >
        {loading ? 'Please wait...' : title}
      </Text>
    </Pressable>
  );
}

function ErrorNotice({ message }) {
  if (!message) {
    return null;
  }

  return (
    <View style={styles.errorWrap}>
      <Text style={styles.errorText}>{message}</Text>
    </View>
  );
}

function MobileAuthApp() {
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'android'
    ? (StatusBar.currentHeight || insets.top || 0)
    : (insets.top || 0);
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [showIntro, setShowIntro] = useState(true);
  const [logoutLoading, setLogoutLoading] = useState(false);
  const otpRefs = useRef([]);
  const [fontsLoaded] = useFonts({
    [FONT_REGULAR]: require('@expo-google-fonts/outfit/400Regular/Outfit_400Regular.ttf'),
    [FONT_MEDIUM]: require('@expo-google-fonts/outfit/500Medium/Outfit_500Medium.ttf'),
    [FONT_SEMIBOLD]: require('@expo-google-fonts/outfit/600SemiBold/Outfit_600SemiBold.ttf'),
    [FONT_BOLD]: require('@expo-google-fonts/outfit/700Bold/Outfit_700Bold.ttf'),
    [FONT_EXTRABOLD]: require('@expo-google-fonts/outfit/800ExtraBold/Outfit_800ExtraBold.ttf'),
  });

  const {
    step,
    phone,
    setPhone,
    otpDigits,
    setOtpDigit,
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
    onAuthenticated: setSession,
  });

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      const currentSession = data?.session || null;
      setSession(currentSession);
      if (currentSession) {
        setShowIntro(false);
      }
      setBooting(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      const resolvedSession = nextSession || null;
      setSession(resolvedSession);

      if (resolvedSession) {
        setShowIntro(false);
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const accountRows = useMemo(() => {
    const user = session?.user;

    return [
      { label: 'Phone', value: user?.phone },
      { label: 'Email', value: user?.email || user?.user_metadata?.email },
      { label: 'Full Name', value: user?.user_metadata?.full_name },
      { label: 'Date of Birth', value: user?.user_metadata?.date_of_birth },
    ];
  }, [session]);

  const firstName = useMemo(() => {
    const name =
      session?.user?.user_metadata?.full_name ||
      session?.user?.phone ||
      'User';

    return name.split(' ')[0] || name;
  }, [session]);

  const handleOpenAuth = () => {
    resetFlow();
    setShowIntro(false);
    otpRefs.current = [];
  };

  const handleBack = () => {
    if (step === AUTH_STEP.PHONE) {
      setShowIntro(true);
      resetFlow();
      otpRefs.current = [];
      return;
    }

    goBack();
  };

  const handlePhoneContinue = async () => {
    const result = await submitPhone();
    if (result?.ok) {
      requestAnimationFrame(() => otpRefs.current[0]?.focus());
    }
  };

  const handleOtpChange = (index, value) => {
    const digit = setOtpDigit(index, value);

    if (digit && index < AUTH_OTP_LENGTH - 1) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index, event) => {
    if (event.nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleLogout = async () => {
    setLogoutLoading(true);

    try {
      await logout(supabase);
    } finally {
      setLogoutLoading(false);
      setSession(null);
      setShowIntro(true);
      resetFlow();
      otpRefs.current = [];
    }
  };

  if (booting || !fontsLoaded) {
    return (
      <View style={[styles.loadingScreen, { paddingTop: topInset, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="dark-content" />
        <Image source={BRAND_LOGO} resizeMode="contain" style={styles.loadingLogo} />
      </View>
    );
  }

  if (session) {
    return (
      <View style={[styles.accountScreen, { paddingTop: topInset + s(18), paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.accountTop}>
          <View style={styles.accountHelloWrap}>
            <View style={styles.avatarBubble}>
              <Text style={styles.avatarLetter}>{firstName.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View>
              <Text style={styles.accountHello}>Hey {firstName}</Text>
              <Text style={styles.accountSub}>Account placeholder page</Text>
            </View>
          </View>

          <ActionButton
            title="Logout"
            variant="outline"
            onPress={handleLogout}
            loading={logoutLoading}
            style={styles.logoutButton}
            textStyle={styles.logoutButtonText}
          />
        </View>

        <View style={styles.accountCard}>
          <Text style={styles.accountCardTitle}>Welcome</Text>
          <Text style={styles.accountCardSubtitle}>
            Next pages will be added in upcoming steps. For now, this screen shows account details.
          </Text>

          <View style={styles.accountRows}>
            {accountRows.map((row) => (
              <View key={row.label} style={styles.accountRow}>
                <Text style={styles.accountLabel}>{row.label}</Text>
                <Text style={styles.accountValue}>{row.value || 'Not available'}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  if (showIntro) {
    return (
      <View style={styles.introScreen}>
        <StatusBar barStyle="light-content" />

        <View style={[styles.introContent, { paddingTop: topInset + s(102), paddingBottom: insets.bottom + s(22) }]}>
          <View>
            <Text style={styles.introTitle}>{AUTH_COPY.intro.title}</Text>
            <Text style={styles.introSubtitle}>{AUTH_COPY.intro.subtitle}</Text>
          </View>

          <ActionButton
            title={AUTH_COPY.intro.cta}
            variant="outline"
            onPress={handleOpenAuth}
            style={styles.introCta}
            textStyle={styles.introCtaText}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.authScreen}>
      <StatusBar barStyle="dark-content" />

      <KeyboardAvoidingView
        style={styles.authKeyboardWrap}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <BackButton onPress={handleBack} topInset={topInset} />

        <ScrollView
          style={styles.authScroll}
          contentContainerStyle={[
            styles.authContent,
            { paddingTop: topInset + s(130), paddingBottom: insets.bottom + s(24) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <ErrorNotice message={error} />

          {step === AUTH_STEP.PHONE && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepTitle, styles.primaryAuthStepTitle]}>{AUTH_COPY.phone.title}</Text>
              <Text style={styles.stepSubtitle}>{AUTH_COPY.phone.subtitle}</Text>

              <Input
                value={phone}
                onChangeText={setPhone}
                placeholder="1234567890"
                inputMode="tel"
                prefix={NEPAL_COUNTRY_CODE}
                prefixStyle={styles.phonePrefix}
                inputStyle={styles.phoneInputText}
                style={styles.phoneInputField}
              />

              <ActionButton
                title={loading ? 'Sending...' : AUTH_COPY.phone.action}
                onPress={handlePhoneContinue}
                loading={loading}
                style={styles.continueButton}
                textStyle={styles.continueButtonText}
              />

              <Text style={styles.orText}>{AUTH_COPY.common.or}</Text>

              <ActionButton
                title={AUTH_COPY.phone.alternate}
                variant="outline"
                style={styles.otherLoginButton}
                textStyle={styles.otherLoginText}
              />
            </View>
          )}

          {step === AUTH_STEP.OTP && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepTitle, styles.primaryAuthStepTitle]}>{AUTH_COPY.otp.title}</Text>
              <Text style={styles.stepSubtitle}>{AUTH_COPY.otp.subtitle}</Text>

              <View style={styles.otpRow}>
                {otpDigits.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(node) => {
                      otpRefs.current[index] = node;
                    }}
                    value={digit}
                    onChangeText={(value) => handleOtpChange(index, value)}
                    onKeyPress={(event) => handleOtpKeyPress(index, event)}
                    keyboardType="number-pad"
                    maxLength={1}
                    autoFocus={index === 0}
                    style={styles.otpInput}
                    textAlign="center"
                  />
                ))}
              </View>

              <ActionButton
                title={loading ? 'Verifying...' : AUTH_COPY.otp.action}
                onPress={submitOtp}
                loading={loading}
                disabled={loading}
                style={styles.filledActionButton}
                textStyle={styles.filledActionButtonText}
              />

              <View style={styles.resendRow}>
                <Text style={styles.resendLead}>{AUTH_COPY.otp.resendLead} </Text>
                <Pressable onPress={resendOtp}>
                  <Text style={styles.resendAction}>{AUTH_COPY.otp.resendAction}</Text>
                </Pressable>
              </View>
            </View>
          )}

          {step === AUTH_STEP.SIGNUP && (
            <View style={styles.stepWrap}>
              <Text style={[styles.stepTitle, styles.primaryAuthStepTitle]}>{AUTH_COPY.signup.title}</Text>
              <Text style={styles.stepSubtitle}>{AUTH_COPY.signup.subtitle}</Text>

              <Text style={styles.signupFieldLabel}>{AUTH_COPY.signup.fullNameLabel}</Text>
              <Input
                value={fullName}
                onChangeText={setFullName}
                placeholder={AUTH_COPY.signup.fullNamePlaceholder}
                style={styles.signupInputField}
                inputStyle={styles.signupInputText}
              />

              <Text style={styles.signupFieldLabel}>{AUTH_COPY.signup.emailLabel}</Text>
              <Input
                type="email"
                value={email}
                onChangeText={setEmail}
                placeholder={AUTH_COPY.signup.emailPlaceholder}
                style={styles.signupInputField}
                inputStyle={styles.signupInputText}
              />

              <Text style={styles.signupFieldLabel}>{AUTH_COPY.signup.dobLabel}</Text>
              <Input
                type="text"
                value={dob}
                onChangeText={setDob}
                placeholder={AUTH_COPY.signup.dobPlaceholder}
                style={styles.signupInputField}
                inputStyle={styles.signupInputText}
              />

              <ActionButton
                title={loading ? 'Signing up...' : AUTH_COPY.signup.action}
                onPress={submitSignup}
                loading={loading}
                disabled={loading}
                style={[styles.filledActionButton, styles.signupButtonWrap]}
                textStyle={styles.filledActionButtonText}
              />

              <Text style={styles.disclaimer}>{AUTH_COPY.signup.disclaimer}</Text>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <MobileAuthApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  actionButtonBase: {
    minHeight: s(AUTH_SIZES.buttonHeight),
    borderRadius: s(AUTH_RADII.field),
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(18),
  },
  actionButtonFilled: {
    backgroundColor: AUTH_COLORS.brand,
    borderColor: AUTH_COLORS.brand,
  },
  actionButtonOutline: {
    backgroundColor: AUTH_COLORS.surface,
    borderColor: AUTH_COLORS.ink,
  },
  actionButtonPressed: {
    transform: [{ translateY: -1 }],
  },
  actionButtonDisabled: {
    opacity: 0.65,
  },
  actionButtonTextBase: {
    fontSize: s(18),
    fontFamily: FONT_BOLD,
    textAlign: 'center',
  },
  actionButtonTextFilled: {
    color: AUTH_COLORS.surface,
  },
  actionButtonTextOutline: {
    color: AUTH_COLORS.ink,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: s(178),
    height: s(178),
  },

  introScreen: {
    flex: 1,
    backgroundColor: AUTH_COLORS.brand,
  },
  introContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: s(24),
    paddingTop: s(132),
    paddingBottom: s(28),
  },
  introTitle: {
    color: AUTH_COLORS.surface,
    fontSize: s(60),
    lineHeight: s(61),
    fontFamily: FONT_EXTRABOLD,
    letterSpacing: -0.4,
    marginBottom: s(14),
    maxWidth: s(320),
  },
  introSubtitle: {
    color: '#FFE4CE',
    fontSize: s(17),
    lineHeight: s(24),
    fontFamily: FONT_BOLD,
    letterSpacing: 0,
    maxWidth: s(316),
  },
  introCta: {
    width: '92%',
    alignSelf: 'center',
    minHeight: s(AUTH_SIZES.buttonHeight),
    borderRadius: s(AUTH_RADII.field),
    backgroundColor: '#EFEFEF',
    borderWidth: 1.8,
    borderColor: '#B6B6B6',
    marginBottom: s(10),
  },
  introCtaText: {
    color: '#4D4D4D',
    fontSize: s(17),
    lineHeight: s(22),
    fontFamily: FONT_BOLD,
  },

  authScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  authKeyboardWrap: {
    flex: 1,
  },
  authScroll: {
    flex: 1,
  },
  authContent: {
    paddingHorizontal: s(39),
    paddingTop: s(112),
    paddingBottom: s(28),
  },
  backButton: {
    position: 'absolute',
    left: s(36),
    width: s(AUTH_SIZES.backButton),
    height: s(AUTH_SIZES.backButton),
    borderRadius: 999,
    backgroundColor: AUTH_COLORS.brand,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  errorWrap: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#FFCDCD',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 14,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: s(14),
    fontFamily: FONT_SEMIBOLD,
  },
  stepWrap: {
    gap: 0,
  },
  stepTitle: {
    color: AUTH_COLORS.brand,
    fontSize: s(55),
    lineHeight: s(58),
    fontFamily: FONT_EXTRABOLD,
    letterSpacing: -0.3,
  },
  primaryAuthStepTitle: {
    fontSize: s(42),
    lineHeight: s(45),
    fontFamily: FONT_BOLD,
  },
  stepSubtitle: {
    color: '#5B5B5B',
    fontSize: s(15),
    lineHeight: s(20),
    fontFamily: FONT_BOLD,
    marginTop: s(6),
    marginBottom: s(18),
  },

  phoneInputField: {
    minHeight: s(AUTH_SIZES.inputHeight),
    borderRadius: s(AUTH_RADII.field),
    borderWidth: 3,
    borderColor: AUTH_COLORS.brand,
    backgroundColor: '#F6E3D2',
    paddingHorizontal: s(16),
    marginBottom: s(14),
  },
  phonePrefix: {
    color: '#6D6D6D',
    fontSize: s(17),
    fontFamily: FONT_BOLD,
  },
  phoneInputText: {
    color: AUTH_COLORS.ink,
    fontSize: s(18),
    fontFamily: FONT_BOLD,
  },
  continueButton: {
    width: '100%',
    minHeight: s(AUTH_SIZES.buttonHeight),
    borderRadius: s(AUTH_RADII.field),
    backgroundColor: AUTH_COLORS.brand,
    borderColor: AUTH_COLORS.brand,
    borderWidth: 2,
    marginBottom: s(12),
  },
  continueButtonText: {
    color: AUTH_COLORS.surface,
    fontSize: s(18),
    fontFamily: FONT_BOLD,
  },
  orText: {
    textAlign: 'center',
    color: '#A1A1A1',
    fontSize: s(18),
    lineHeight: s(24),
    fontFamily: FONT_BOLD,
    marginBottom: s(10),
  },
  otherLoginButton: {
    width: '100%',
    minHeight: s(AUTH_SIZES.buttonHeight),
    borderRadius: s(AUTH_RADII.field),
    borderWidth: 3,
    borderColor: AUTH_COLORS.ink,
    backgroundColor: '#FFFFFF',
  },
  otherLoginText: {
    color: AUTH_COLORS.ink,
    fontSize: s(18),
    fontFamily: FONT_BOLD,
  },

  otpRow: {
    flexDirection: 'row',
    gap: s(10),
    marginBottom: s(18),
  },
  otpInput: {
    flex: 1,
    minHeight: s(AUTH_SIZES.otpBox),
    borderRadius: s(15),
    borderWidth: 4,
    borderColor: AUTH_COLORS.brand,
    backgroundColor: '#F6E3D2',
    color: AUTH_COLORS.ink,
    fontSize: s(22),
    fontFamily: FONT_EXTRABOLD,
    textAlign: 'center',
  },
  filledActionButton: {
    width: '100%',
    minHeight: s(AUTH_SIZES.buttonHeight),
    borderRadius: s(AUTH_RADII.field),
    backgroundColor: AUTH_COLORS.brand,
    borderColor: AUTH_COLORS.brand,
    borderWidth: 2,
    marginBottom: s(12),
  },
  filledActionButtonText: {
    color: AUTH_COLORS.surface,
    fontSize: s(18),
    fontFamily: FONT_BOLD,
  },
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: s(2),
  },
  resendLead: {
    color: '#5E5E5E',
    fontSize: s(13),
    lineHeight: s(20),
    fontFamily: FONT_SEMIBOLD,
  },
  resendAction: {
    color: AUTH_COLORS.ink,
    fontSize: s(13),
    lineHeight: s(20),
    fontFamily: FONT_SEMIBOLD,
  },
  signupFieldLabel: {
    color: '#2C2C2C',
    fontSize: s(14),
    lineHeight: s(20),
    fontFamily: FONT_BOLD,
    marginBottom: s(8),
    marginTop: s(2),
  },

  signupInputField: {
    minHeight: s(AUTH_SIZES.inputHeight),
    borderRadius: s(AUTH_RADII.field),
    borderWidth: 3,
    borderColor: AUTH_COLORS.brand,
    backgroundColor: '#F6E3D2',
    paddingHorizontal: s(16),
    marginBottom: s(8),
  },
  signupInputText: {
    fontSize: s(18),
    color: '#1E1E1E',
    fontFamily: FONT_BOLD,
  },
  signupButtonWrap: {
    marginTop: s(6),
    marginBottom: s(4),
  },
  disclaimer: {
    textAlign: 'center',
    color: '#B6B6B6',
    fontSize: s(15),
    lineHeight: s(21),
    fontFamily: FONT_BOLD,
    marginTop: s(2),
    marginBottom: s(8),
    paddingHorizontal: s(18),
  },

  accountScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  accountTop: {
    marginTop: 6,
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  accountHelloWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexShrink: 1,
  },
  avatarBubble: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: '#F8964F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    color: '#FFFFFF',
    fontSize: 20,
    fontFamily: FONT_EXTRABOLD,
  },
  accountHello: {
    color: '#F8964F',
    fontSize: 26,
    lineHeight: 28,
    fontFamily: FONT_BOLD,
  },
  accountSub: {
    color: '#6D6661',
    fontSize: 14,
    lineHeight: 18,
    fontFamily: FONT_MEDIUM,
  },
  logoutButton: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 2,
  },
  logoutButtonText: {
    fontSize: 14,
    fontFamily: FONT_BOLD,
  },
  accountCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#F1E5D9',
    backgroundColor: '#FFFFFF',
    padding: 20,
    shadowColor: '#3B1F08',
    shadowOpacity: 0.09,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 10 },
  },
  accountCardTitle: {
    color: '#F8964F',
    fontSize: 28,
    lineHeight: 31,
    fontFamily: FONT_EXTRABOLD,
  },
  accountCardSubtitle: {
    color: '#6D6661',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FONT_MEDIUM,
    marginTop: 8,
    marginBottom: 16,
  },
  accountRows: {
    gap: 10,
  },
  accountRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#EFE0D2',
    backgroundColor: '#FDF8F3',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 4,
  },
  accountLabel: {
    color: '#6D6661',
    fontSize: 13,
    fontFamily: FONT_BOLD,
  },
  accountValue: {
    color: '#1E1E1E',
    fontSize: 14,
    fontFamily: FONT_BOLD,
  },
});
