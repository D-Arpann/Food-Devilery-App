import { useEffect, useState } from 'react';
import { createAppClient, logout } from '@repo/api';
import { SUPABASE_DEFAULTS } from '@repo/utils';
import LoginPopup from './components/LoginPopup';
import WebPage from './components/WebPage';
import DiscoveryPage from './components/DiscoveryPage';

const supabase = createAppClient({
  supabaseUrl:
    import.meta.env.VITE_SUPABASE_URL || SUPABASE_DEFAULTS.URL,
  supabaseKey:
    import.meta.env.VITE_SUPABASE_ANON_KEY ||
    SUPABASE_DEFAULTS.ANON_KEY,
});

export default function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState(null);
  const [isLoginOpen, setIsLoginOpen] = useState(false);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) {
        return;
      }

      setSession(data?.session || null);
      setBooting(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    await logout(supabase);
    setSession(null);
  };

  if (booting) {
    return (
      <main className="screen-center">
        <div className="pulse" />
        <p>Loading Chito Mitho...</p>
      </main>
    );
  }

  const showAuthShell = !session || isLoginOpen;

  if (showAuthShell) {
    return (
      <>
        <WebPage onOpenLogin={() => setIsLoginOpen(true)} />
        <LoginPopup
          isOpen={isLoginOpen}
          onClose={() => setIsLoginOpen(false)}
          supabase={supabase}
          onAuthenticated={setSession}
        />
      </>
    );
  }

  return (
    <DiscoveryPage
      session={session}
      supabase={supabase}
      onLogout={handleLogout}
    />
  );
}
