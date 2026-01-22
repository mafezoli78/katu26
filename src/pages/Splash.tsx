import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import logoKatu from '@/assets/logo-katu-branco.png';

export default function Splash() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, isProfileComplete } = useProfile();

  useEffect(() => {
    if (authLoading || (user && profileLoading)) return;

    const timer = setTimeout(() => {
      if (!user) {
        navigate('/auth', { replace: true });
      } else if (!isProfileComplete()) {
        navigate('/onboarding', { replace: true });
      } else {
        navigate('/home', { replace: true });
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [user, authLoading, profileLoading, profile, navigate, isProfileComplete]);

  return (
    <div className="min-h-screen bg-primary flex flex-col items-center justify-center animate-fade-in">
      <img 
        src={logoKatu} 
        alt="Katu" 
        className="w-48 h-auto animate-pulse-soft"
      />
      <p className="text-primary-foreground/70 text-sm mt-8">
        Conectando pessoas no mesmo lugar
      </p>
    </div>
  );
}
