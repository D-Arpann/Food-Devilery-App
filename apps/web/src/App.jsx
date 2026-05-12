import { useCallback, useEffect, useRef, useState } from 'react';
import { createAppClient, fetchOwnedRestaurant, logout } from '@repo/api';
import { SUPABASE_DEFAULTS, TABLES, USER_ROLES } from '@repo/utils';
import { CartProvider } from '@repo/ui';
import LoginPage from './components/LoginPage';
import WebPage from './components/WebPage';
import DiscoveryPage from './components/DiscoveryPage';
import RestaurantSignupPage from './components/RestaurantSignupPage';
import RestaurantDashboardPage from './components/RestaurantDashboardPage';
import AdminDashboardPage from './components/AdminDashboardPage';

const supabase = createAppClient({
  supabaseUrl:
    import.meta.env.VITE_SUPABASE_URL || SUPABASE_DEFAULTS.URL,
  supabaseKey:
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    SUPABASE_DEFAULTS.ANON_KEY,
});

const SCREEN = {
  LANDING: 'landing',
  LOGIN: 'login',
  RESTAURANT_SIGNUP: 'restaurant-signup',
};

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [accountRole, setAccountRole] = useState(null);
  const [roleLoading, setRoleLoading] = useState(false);
  const [screen, setScreen] = useState(SCREEN.LANDING);
  const [loginReturnScreen, setLoginReturnScreen] = useState(SCREEN.LANDING);
  const [accessMessage, setAccessMessage] = useState('');
  const roleResolvedRef = useRef(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      setSession(data?.session || null);
      setBooting(false);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'USER_UPDATED' && roleResolvedRef.current) {
        // Profile saves update auth metadata. Keep local page state in place;
        // profile components already patch their own visible data.
        return;
      }

      setSession(nextSession || null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id) {
      setAccountRole(null);
      setRoleLoading(false);
      return undefined;
    }

    if (screen === SCREEN.LOGIN) {
      setRoleLoading(false);
      return undefined;
    }

    if (screen === SCREEN.RESTAURANT_SIGNUP) {
      const trustedRole = session.user?.app_metadata?.role || session.user?.user_metadata?.role || '';
      const trustedVerificationStatus =
        session.user?.app_metadata?.verification_status ||
        session.user?.user_metadata?.verification_status ||
        '';

      if (!(trustedRole === USER_ROLES.RIDER && trustedVerificationStatus === 'verified')) {
        setRoleLoading(false);
        return undefined;
      }
    }

    let active = true;
    setRoleLoading(true);

    async function resolveAccountRole() {
      try {
        const trustedRole = session.user?.app_metadata?.role || session.user?.user_metadata?.role || '';
        const trustedVerificationStatus =
          session.user?.app_metadata?.verification_status ||
          session.user?.user_metadata?.verification_status ||
          '';
        const hasTrustedRole = Object.values(USER_ROLES).includes(trustedRole);

        if (session.isTemporaryAuth) {
          if (active) {
            setAccountRole(hasTrustedRole ? trustedRole : USER_ROLES.CUSTOMER);
          }
          return;
        }

        const { data: profile, error } = await supabase
          .from(TABLES.USER_PROFILES)
          .select('role, verification_status')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!active) {
          return;
        }

        if (error) {
          console.error('Error fetching profile role:', error);
          setAccountRole(hasTrustedRole ? trustedRole : USER_ROLES.CUSTOMER);
          return;
        }

        if (!profile) {
          if (trustedRole === USER_ROLES.RIDER && trustedVerificationStatus === 'verified') {
            await logout(supabase);
            if (active) {
              setSession(null);
              setAccountRole(null);
              setAccessMessage('Rider accounts should use the mobile app.');
              setScreen(SCREEN.LOGIN);
            }
            return;
          }

          if (hasTrustedRole) {
            setAccountRole(trustedRole);
            return;
          }

          await logout(supabase);
          if (active) {
            setSession(null);
            setAccountRole(null);
            setScreen(SCREEN.LOGIN);
          }
          return;
        }

        const resolvedRole = profile?.role || (hasTrustedRole ? trustedRole : USER_ROLES.CUSTOMER);
        const resolvedVerificationStatus = profile?.verification_status || trustedVerificationStatus || 'verified';

        if (resolvedRole === USER_ROLES.RIDER && resolvedVerificationStatus === 'verified') {
          await logout(supabase);
          if (active) {
            setSession(null);
            setAccountRole(null);
            setAccessMessage('Rider accounts should use the mobile app.');
            setScreen(SCREEN.LOGIN);
          }
          return;
        }

        if (resolvedRole === USER_ROLES.RESTAURANT_OWNER) {
          setScreen(SCREEN.LANDING);
          setAccountRole(USER_ROLES.RESTAURANT_OWNER);
          return;
        }

        if (resolvedRole === USER_ROLES.CUSTOMER) {
          const { data: ownedRestaurant, error: restaurantError } = await fetchOwnedRestaurant(
            supabase,
            session.user.id,
          );

          if (!active) {
            return;
          }

          if (restaurantError) {
            console.error('Error fetching owned restaurant:', restaurantError);
          } else if (ownedRestaurant?.verification_status === 'verified') {
            setAccountRole(USER_ROLES.RESTAURANT_OWNER);
            return;
          } else if (ownedRestaurant?.verification_status === 'pending') {
            setScreen(SCREEN.RESTAURANT_SIGNUP);
          }
        }

        setAccountRole(resolvedRole);
      } catch (error) {
        console.error('Error resolving account role:', error);
        if (active) {
          setAccountRole(USER_ROLES.CUSTOMER);
        }
      } finally {
        if (active) {
          setRoleLoading(false);
          roleResolvedRef.current = true;
        }
      }
    }

    resolveAccountRole();

    return () => {
      active = false;
    };
  }, [screen, session]);

  const handleLogout = async () => {
    await logout(supabase);
    setSession(null);
    setAccountRole(null);
    setScreen(SCREEN.LANDING);
  };

  const handleOpenRestaurantSignup = () => {
    setScreen(SCREEN.RESTAURANT_SIGNUP);
  };

  const handleOpenLanding = () => {
    setScreen(SCREEN.LANDING);
  };

  const handleOpenLogin = (returnScreen = screen) => {
    setLoginReturnScreen(returnScreen);
    setAccessMessage('');
    setScreen(SCREEN.LOGIN);
  };

  const handleRestaurantApplicationVerified = useCallback(() => {
    setAccountRole(USER_ROLES.RESTAURANT_OWNER);
    setScreen(SCREEN.LANDING);
  }, []);

  if (booting) {
    return (
      <main className="screen-center">
        <div className="pulse" />
        <p>Loading Chito Mitho...</p>
      </main>
    );
  }

  const showPublicShell = !session || screen === SCREEN.LOGIN || screen === SCREEN.RESTAURANT_SIGNUP;

  if (showPublicShell) {
    return (
      <>
        {screen === SCREEN.RESTAURANT_SIGNUP ? (
          <RestaurantSignupPage
            supabase={supabase}
            session={session}
            onBack={handleOpenLanding}
            onAuthenticated={setSession}
            onApplicationVerified={handleRestaurantApplicationVerified}
          />
        ) : screen === SCREEN.LOGIN ? (
          <LoginPage
            supabase={supabase}
            notice={accessMessage}
            onBack={handleOpenLanding}
            onOpenRestaurantSignup={handleOpenRestaurantSignup}
            onAuthenticated={(nextSession) => {
              setAccessMessage('');
              setSession(nextSession);
              setScreen(loginReturnScreen || SCREEN.LANDING);
              setLoginReturnScreen(SCREEN.LANDING);
            }}
          />
        ) : (
          <WebPage
            supabase={supabase}
            onOpenLogin={() => handleOpenLogin(SCREEN.LANDING)}
            onOpenRestaurantSignup={handleOpenRestaurantSignup}
          />
        )}
      </>
    );
  }

  if (roleLoading) {
    return (
      <main className="screen-center">
        <div className="pulse" />
        <p>Loading your workspace...</p>
      </main>
    );
  }

  if (accountRole === USER_ROLES.RESTAURANT_OWNER) {
    return (
      <RestaurantDashboardPage
        session={session}
        supabase={supabase}
        onLogout={handleLogout}
      />
    );
  }

  if (accountRole === USER_ROLES.ADMIN) {
    return (
      <AdminDashboardPage
        session={session}
        supabase={supabase}
        onLogout={handleLogout}
      />
    );
  }

  return (
    <CartProvider>
      <DiscoveryPage
        session={session}
        supabase={supabase}
        onLogout={handleLogout}
      />
    </CartProvider>
  );
}
