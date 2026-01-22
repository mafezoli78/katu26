import { ReactNode } from 'react';
import { BottomNav } from './BottomNav';

interface MobileLayoutProps {
  children: ReactNode;
  showNav?: boolean;
}

export function MobileLayout({ children, showNav = true }: MobileLayoutProps) {
  return (
    <div className="mobile-container bg-background min-h-screen">
      <main className={showNav ? 'pb-20' : ''}>
        {children}
      </main>
      {showNav && <BottomNav />}
    </div>
  );
}
