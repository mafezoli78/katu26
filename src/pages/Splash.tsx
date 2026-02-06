import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import logoKatuu from '@/assets/logo-katuu.png';
import iconKatuu from '@/assets/icon-katuu.png';

export default function Splash() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { profile, loading: profileLoading, isProfileComplete } = useProfile();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Animate progress bar
    const progressInterval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) return 100;
        return prev + 2;
      });
    }, 40);

    return () => clearInterval(progressInterval);
  }, []);

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
    <div className="min-h-screen katu-gradient flex flex-col items-center justify-center animate-fade-in relative overflow-hidden">
      {/* Background subtle pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-20 left-10 w-32 h-32 rounded-full bg-white/20 blur-3xl" />
        <div className="absolute bottom-40 right-10 w-40 h-40 rounded-full bg-white/15 blur-3xl" />
      </div>

      {/* Logo text */}
      <img 
        src={logoKatuu} 
        alt="Katuu" 
        className="w-56 h-auto mb-12 animate-fade-in drop-shadow-lg"
      />
      
      {/* Icon - transparent background */}
      <div className="relative mb-8">
        <img 
          src={iconKatuu} 
          alt="" 
          className="w-32 h-32 object-contain drop-shadow-2xl"
        />
      </div>

      {/* Tagline */}
      <p className="text-white/80 text-base mt-6 font-medium tracking-wide">
        o presente em movimento
      </p>

      {/* Loading bar */}
      <div className="mt-12 w-48 h-1.5 bg-white/20 rounded-full overflow-hidden">
        <div 
          className="h-full rounded-full transition-all duration-100 ease-out"
          style={{ 
            width: `${progress}%`,
            background: 'linear-gradient(90deg, #F4A261 0%, #40C2A8 100%)'
          }}
        />
      </div>
    </div>
  );
}
