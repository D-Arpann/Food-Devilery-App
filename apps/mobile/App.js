import { useEffect, useRef, useState } from 'react';
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
import { createAppClient, fetchCustomerSettings } from '@repo/api';
import { CartProvider, Input, Logo, usePhoneAuthFlow } from '@repo/ui';
import {
  AUTH_COPY,
  AUTH_THEME,
  AUTH_OTP_LENGTH,
  AUTH_STEP,
  NEPAL_COUNTRY_CODE,
  SUPABASE_DEFAULTS,
  USER_ROLES,
} from '@repo/utils';
import { DiscoveryScreen } from './src/DiscoveryScreen';
import { RiderScreen } from './src/RiderScreen';
import './global.css';

const supabase = createAppClient({
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || SUPABASE_DEFAULTS.URL,
  supabaseKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || SUPABASE_DEFAULTS.ANON_KEY,
});
const BRAND_LOGO = Logo;
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

function BackButton({ onPress, topInset = 0 }) {
  return (
    <Pressable onPress={onPress} style={[styles.backButton, { top: topInset + s(26) }]}>
      <Ionicons name="arrow-back" size={s(21)} color="#1E1E1E" />
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
      android_ripple={{ color: variant === 'outline' ? 'rgba(30, 30, 30, 0.08)' : 'rgba(255, 255, 255, 0.22)' }}
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
  const [accountProfile, setAccountProfile] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const otpRefs = useRef([]);
  const lastAutoSubmittedOtpRef = useRef('');
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
      } else {
        setShowIntro(true);
        setAccountProfile(null);
        setRoleLoading(false);
        resetFlow();
        otpRefs.current = [];
      }
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleOpenAuth = () => {
    resetFlow();
    setShowIntro(false);
    otpRefs.current = [];
  };

  useEffect(() => {
    if (!session?.user?.id) {
      setAccountProfile(null);
      setRoleLoading(false);
      return undefined;
    }

    if (session?.isTemporaryAuth) {
      setAccountProfile({
        id: session.user.id,
        role: session.user?.app_metadata?.role || session.user?.user_metadata?.role || USER_ROLES.CUSTOMER,
      });
      setRoleLoading(false);
      return undefined;
    }

    let active = true;
    setRoleLoading(true);

    fetchCustomerSettings(supabase, session.user.id).then(async ({ data, error: profileError }) => {
      if (active) {
        const trustedRole = session.user?.app_metadata?.role || session.user?.user_metadata?.role || '';
        const hasTrustedRole = Object.values(USER_ROLES).includes(trustedRole);

        if (profileError && step !== AUTH_STEP.SIGNUP && !hasTrustedRole) {
          await supabase.auth.signOut();
          return;
        }
        setAccountProfile(data ? {
          id: data.id,
          role: data.role || (hasTrustedRole ? trustedRole : USER_ROLES.CUSTOMER),
        } : {
          id: session.user.id,
          role: hasTrustedRole ? trustedRole : USER_ROLES.CUSTOMER,
        });
        setRoleLoading(false);
      }
    });

    return () => {
      active = false;
    };
  }, [session?.isTemporaryAuth, session?.user?.id, step]);

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

  // Auto-submit OTP when all digits are filled — removes the need to press Verify
  useEffect(() => {
    if (step !== AUTH_STEP.OTP) {
      lastAutoSubmittedOtpRef.current = '';
      return;
    }

    const allFilled = otpDigits.length === AUTH_OTP_LENGTH && otpDigits.every((d) => d !== '');
    const otpCode = otpDigits.join('');
    if (allFilled && !loading && lastAutoSubmittedOtpRef.current !== otpCode) {
      lastAutoSubmittedOtpRef.current = otpCode;
      submitOtp();
    }
  }, [otpDigits, step, loading, submitOtp]);

  if (booting || !fontsLoaded) {
    return (
      <View style={[styles.loadingScreen, { paddingTop: topInset, paddingBottom: insets.bottom }]}>
        <StatusBar barStyle="dark-content" />
        <Image source={BRAND_LOGO} resizeMode="contain" style={styles.loadingLogo} />
      </View>
    );
  }

  if (session && step !== AUTH_STEP.SIGNUP) {
    const accountRole = accountProfile?.role || session.user?.app_metadata?.role || session.user?.user_metadata?.role || USER_ROLES.CUSTOMER;

    if (roleLoading) {
      return (
        <View style={[styles.loadingScreen, { paddingTop: topInset, paddingBottom: insets.bottom }]}>
          <StatusBar barStyle="dark-content" />
          <Image source={BRAND_LOGO} resizeMode="contain" style={styles.loadingLogo} />
        </View>
      );
    }

    if (accountRole === USER_ROLES.RIDER) {
      return (
        <RiderScreen
          session={session}
          supabase={supabase}
          topInset={topInset}
          bottomInset={insets.bottom}
        />
      );
    }

    return (
      <CartProvider>
        <DiscoveryScreen
          session={session}
          supabase={supabase}
          topInset={topInset}
          bottomInset={insets.bottom}
          brandLogo={BRAND_LOGO}
        />
      </CartProvider>
    );
  }

  if (showIntro) {
    return (
      <View style={styles.introScreen}>
        <StatusBar barStyle="dark-content" />

        <View style={[styles.introContent, { paddingTop: topInset + s(34), paddingBottom: insets.bottom + s(18) }]}>
          <View style={styles.introBrandCard}>
            <Image source={BRAND_LOGO} resizeMode="contain" style={styles.introLogo} />
            <View style={styles.introBrandText}>
              <Text style={styles.introBrandName}>Chito Mitho</Text>
            </View>
          </View>

          <View style={styles.introCopy}>
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
            { paddingTop: topInset + s(78), paddingBottom: insets.bottom + s(20) },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.authHeaderCard}>
            <Image source={BRAND_LOGO} resizeMode="contain" style={styles.authLogo} />
            <View>
              <Text style={styles.authBrandName}>Chito Mitho</Text>
            </View>
          </View>

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
                maxLength={10}
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

              <Text style={styles.authFinePrint}>We will send a one-time code to this number.</Text>

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
    minHeight: s(48),
    borderRadius: s(8),
    borderWidth: 1,
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
    fontSize: s(16),
    fontFamily: FONT_SEMIBOLD,
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
    backgroundColor: '#FFFCF9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingLogo: {
    width: s(112),
    height: s(112),
  },

  introScreen: {
    flex: 1,
    backgroundColor: '#FBFBFB',
  },
  introContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: s(16),
    paddingTop: s(34),
    paddingBottom: s(18),
  },
  introBrandCard: {
    minHeight: s(42),
    paddingHorizontal: 0,
    paddingVertical: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(9),
  },
  introLogo: {
    width: s(34),
    height: s(34),
  },
  introBrandText: {
    flex: 1,
  },
  introBrandName: {
    color: '#1E1E1E',
    fontSize: s(15),
    lineHeight: s(18),
    fontFamily: FONT_BOLD,
  },
  introBrandMeta: {
    color: '#6E6761',
    fontSize: s(12),
    lineHeight: s(16),
    fontFamily: FONT_MEDIUM,
    marginTop: s(1),
  },
  introCopy: {
    marginTop: s(108),
    marginBottom: s(24),
  },
  introTitle: {
    color: '#1E1E1E',
    fontSize: s(36),
    lineHeight: s(39),
    fontFamily: FONT_EXTRABOLD,
    letterSpacing: 0,
    marginBottom: s(10),
    maxWidth: s(310),
  },
  introSubtitle: {
    color: '#5E5852',
    fontSize: s(15),
    lineHeight: s(21),
    fontFamily: FONT_MEDIUM,
    letterSpacing: 0,
    maxWidth: s(316),
  },
  introMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: s(8),
    marginTop: s(16),
  },
  introMetaPill: {
    minHeight: s(30),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: '#F3D7C2',
    backgroundColor: '#FFF8F2',
    paddingHorizontal: s(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(5),
  },
  introMetaText: {
    color: '#6E5748',
    fontSize: s(12),
    fontFamily: FONT_SEMIBOLD,
  },
  introCta: {
    width: '100%',
    alignSelf: 'center',
    minHeight: s(54),
    borderRadius: s(13),
    backgroundColor: '#F8964F',
    borderWidth: 0,
    marginBottom: s(10),
    shadowColor: '#E07830',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  introCtaText: {
    color: '#FFFFFF',
    fontSize: s(16),
    lineHeight: s(20),
    fontFamily: FONT_BOLD,
  },

  authScreen: {
    flex: 1,
    backgroundColor: '#FBFBFB',
  },
  authKeyboardWrap: {
    flex: 1,
  },
  authScroll: {
    flex: 1,
  },
  authContent: {
    paddingHorizontal: s(16),
    paddingTop: s(78),
    paddingBottom: s(20),
  },
  backButton: {
    position: 'absolute',
    left: s(16),
    width: s(40),
    height: s(40),
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  errorWrap: {
    backgroundColor: '#FFF0F0',
    borderWidth: 1,
    borderColor: '#FFCDCD',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 14,
  },
  errorText: {
    color: '#D32F2F',
    fontSize: s(14),
    fontFamily: FONT_SEMIBOLD,
  },
  stepWrap: {
    gap: 0,
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    padding: s(16),
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 16,
    elevation: 4,
  },
  authHeaderCard: {
    minHeight: s(42),
    paddingHorizontal: 0,
    paddingVertical: 0,
    marginBottom: s(12),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(9),
  },
  authLogo: {
    width: s(34),
    height: s(34),
  },
  authBrandName: {
    color: '#1E1E1E',
    fontSize: s(15),
    lineHeight: s(18),
    fontFamily: FONT_BOLD,
  },
  authBrandMeta: {
    color: '#6E6761',
    fontSize: s(12),
    lineHeight: s(16),
    fontFamily: FONT_MEDIUM,
  },
  stepTitle: {
    color: '#1E1E1E',
    fontSize: s(28),
    lineHeight: s(32),
    fontFamily: FONT_EXTRABOLD,
    letterSpacing: 0,
  },
  primaryAuthStepTitle: {
    fontSize: s(28),
    lineHeight: s(32),
    fontFamily: FONT_EXTRABOLD,
  },
  stepSubtitle: {
    color: '#6E6761',
    fontSize: s(14),
    lineHeight: s(20),
    fontFamily: FONT_MEDIUM,
    marginTop: s(6),
    marginBottom: s(18),
  },

  phoneInputField: {
    minHeight: s(48),
    borderRadius: s(12),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FAFAFA',
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
    fontSize: s(16),
    fontFamily: FONT_SEMIBOLD,
  },
  continueButton: {
    width: '100%',
    minHeight: s(52),
    borderRadius: s(12),
    backgroundColor: AUTH_COLORS.brand,
    borderColor: AUTH_COLORS.brand,
    borderWidth: 2,
    marginBottom: s(12),
    shadowColor: AUTH_COLORS.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
  },
  continueButtonText: {
    color: AUTH_COLORS.surface,
    fontSize: s(16),
    fontFamily: FONT_SEMIBOLD,
  },
  orText: {
    textAlign: 'center',
    color: '#A1A1A1',
    fontSize: s(13),
    lineHeight: s(24),
    fontFamily: FONT_BOLD,
    marginBottom: s(10),
  },
  authFinePrint: {
    textAlign: 'center',
    color: '#8C837C',
    fontSize: s(12),
    lineHeight: s(17),
    fontFamily: FONT_MEDIUM,
    marginTop: s(2),
  },
  mobileDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(9),
    marginVertical: s(14),
  },
  mobileDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#ECECEC',
  },
  mobileDividerText: {
    color: '#8C837C',
    fontSize: s(11),
    fontFamily: FONT_BOLD,
    textTransform: 'uppercase',
  },
  credentialPanel: {
    gap: s(9),
  },
  credentialInput: {
    minHeight: s(46),
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FAFAFA',
    color: '#1E1E1E',
    fontSize: s(14),
    fontFamily: FONT_SEMIBOLD,
    paddingHorizontal: s(14),
  },
  passwordButton: {
    width: '100%',
    minHeight: s(48),
    borderRadius: s(10),
    backgroundColor: '#1E1E1E',
    borderColor: '#1E1E1E',
    marginBottom: s(4),
  },
  passwordButtonText: {
    color: '#FFFFFF',
    fontSize: s(15),
    fontFamily: FONT_BOLD,
  },
  demoAccountRow: {
    flexDirection: 'row',
    gap: s(8),
    marginBottom: s(10),
  },
  demoAccountButton: {
    flex: 1,
    minHeight: s(36),
    borderRadius: s(9),
    borderWidth: 1,
    borderColor: '#F0E8E0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoAccountText: {
    color: '#4F4A45',
    fontSize: s(12),
    fontFamily: FONT_BOLD,
  },
  otherLoginButton: {
    width: '100%',
    minHeight: s(46),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
  },
  otherLoginText: {
    color: '#4F4A45',
    fontSize: s(14),
    fontFamily: FONT_SEMIBOLD,
  },

  otpRow: {
    flexDirection: 'row',
    gap: s(10),
    marginBottom: s(18),
  },
  otpInput: {
    flex: 1,
    minHeight: s(58),
    borderRadius: s(14),
    borderWidth: 1.5,
    borderColor: '#F0E8E0',
    backgroundColor: '#FAFAFA',
    color: AUTH_COLORS.ink,
    fontSize: s(24),
    fontFamily: FONT_EXTRABOLD,
    textAlign: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  filledActionButton: {
    width: '100%',
    minHeight: s(52),
    borderRadius: s(12),
    backgroundColor: AUTH_COLORS.brand,
    borderColor: AUTH_COLORS.brand,
    borderWidth: 2,
    marginBottom: s(12),
    shadowColor: AUTH_COLORS.brand,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 5,
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
    minHeight: s(48),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: s(16),
    marginBottom: s(8),
  },
  signupInputText: {
    fontSize: s(15),
    color: '#1E1E1E',
    fontFamily: FONT_MEDIUM,
  },
  signupButtonWrap: {
    marginTop: s(6),
    marginBottom: s(4),
  },
  disclaimer: {
    textAlign: 'center',
    color: '#B6B6B6',
    fontSize: s(12),
    lineHeight: s(17),
    fontFamily: FONT_MEDIUM,
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

  // --- Brand-aligned intro/auth overrides ---
  introContent: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingHorizontal: s(24),
    paddingTop: s(36),
    paddingBottom: s(28),
    gap: s(24),
  },
  introBrandCard: {
    minHeight: s(62),
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: s(12),
    paddingVertical: s(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
  },
  introCopy: {
    flex: 1,
    justifyContent: 'center',
    marginTop: 0,
    marginBottom: 0,
  },
  introTitle: {
    color: '#1E1E1E',
    fontSize: s(36),
    lineHeight: s(40),
    fontFamily: FONT_BOLD,
    letterSpacing: 0,
    marginBottom: s(12),
    maxWidth: s(330),
  },
  introSubtitle: {
    color: '#5E5E5E',
    fontSize: s(15),
    lineHeight: s(22),
    fontFamily: FONT_MEDIUM,
    letterSpacing: 0,
    maxWidth: s(330),
  },
  introCta: {
    width: '100%',
    alignSelf: 'center',
    minHeight: s(54),
    borderRadius: s(10),
    backgroundColor: '#F8964F',
    borderWidth: 0,
    marginBottom: s(10),
    shadowColor: '#F8964F',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 5,
  },
  authHeaderCard: {
    minHeight: s(58),
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: s(12),
    paddingVertical: s(9),
    marginBottom: s(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
  },
  stepWrap: {
    gap: 0,
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    padding: s(18),
  },
  continueButton: {
    marginTop: s(18),
    minHeight: s(54),
    borderRadius: s(10),
    backgroundColor: '#F8964F',
    borderWidth: 0,
  },
  filledActionButton: {
    marginTop: s(18),
    minHeight: s(54),
    borderRadius: s(10),
    backgroundColor: '#F8964F',
    borderWidth: 0,
  },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  introScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  authScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  actionButtonBase: {
    minHeight: s(48),
    borderRadius: s(10),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: s(18),
  },
  backButton: {
    position: 'absolute',
    left: s(24),
    width: s(40),
    height: s(40),
    borderRadius: s(20),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  introBrandCard: {
    minHeight: s(60),
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: s(12),
    paddingVertical: s(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
  },
  introMetaPill: {
    minHeight: s(30),
    borderRadius: s(999),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: s(10),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(5),
  },
  introCta: {
    width: '100%',
    alignSelf: 'center',
    minHeight: s(54),
    borderRadius: s(10),
    backgroundColor: '#F8964F',
    borderWidth: 0,
    marginBottom: s(10),
  },
  authHeaderCard: {
    minHeight: s(58),
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: s(12),
    paddingVertical: s(9),
    marginBottom: s(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
  },
  stepWrap: {
    gap: 0,
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    padding: s(18),
  },
  phoneInputField: {
    minHeight: s(48),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: s(16),
    marginBottom: s(14),
  },
  signupInputField: {
    minHeight: s(48),
    borderRadius: s(8),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: s(16),
    marginBottom: s(8),
  },
  otpInput: {
    flex: 1,
    minHeight: s(56),
    borderRadius: s(10),
    borderWidth: 1,
    borderColor: '#ECECEC',
    backgroundColor: '#FFFFFF',
    color: AUTH_COLORS.ink,
    fontSize: s(22),
    fontFamily: FONT_EXTRABOLD,
    textAlign: 'center',
  },
  continueButton: {
    marginTop: s(18),
    minHeight: s(54),
    borderRadius: s(10),
    backgroundColor: '#F8964F',
    borderWidth: 0,
  },
  filledActionButton: {
    marginTop: s(18),
    minHeight: s(54),
    borderRadius: s(10),
    backgroundColor: '#F8964F',
    borderWidth: 0,
  },
});
