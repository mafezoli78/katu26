import logoKatuu from '@/assets/logo-katuu.png';

interface AppHeaderProps {
  showLogo?: boolean;
  className?: string;
}

export function AppHeader({ showLogo = true, className = '' }: AppHeaderProps) {
  return (
    <header className={`bg-primary py-3 px-4 ${className}`}>
      {showLogo && (
        <div className="flex justify-center">
          <img 
            src={logoKatuu} 
            alt="Katuu" 
            className="h-8 w-auto"
          />
        </div>
      )}
    </header>
  );
}
