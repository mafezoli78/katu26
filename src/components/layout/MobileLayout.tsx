import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { AppHeader } from './AppHeader';

interface MobileLayoutProps {
  children: ReactNode;
  showNav?: boolean;
  showHeader?: boolean;
}

export function MobileLayout({ children, showNav = true, showHeader = true }: MobileLayoutProps) {
  return (
    <div className="mobile-container bg-background min-h-screen flex flex-col">
      {showHeader && <AppHeader />}
      <main className={`flex-1 overflow-hidden ${showNav ? 'pb-20' : ''}`}>
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}
