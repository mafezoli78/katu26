import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';
import { AppHeader } from './AppHeader';

interface MobileLayoutProps {
  children: ReactNode;
  showNav?: boolean;
  showHeader?: boolean;
  fixedHeight?: boolean;
}

export function MobileLayout({ children, showNav = true, showHeader = true, fixedHeight = false }: MobileLayoutProps) {
  return (
    <div className={`mobile-container bg-background flex flex-col ${fixedHeight ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
      {showHeader && <AppHeader />}
      <main className={`flex-1 overflow-hidden ${showNav ? 'pb-20' : ''}`}>
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}
