import { Home, User, MessageCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useWaves } from '@/hooks/useWaves';
import { useConversations } from '@/hooks/useConversations';

// Custom waving hand icon component
function WavingHand({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 11.5V14c0 2.5 2 4.5 5 6c3-1.5 5-3.5 5-6v-2.5" />
      <path d="M11.5 6.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v4.5" />
      <path d="M14.5 7.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v3" />
      <path d="M17.5 9.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v2" />
      <path d="M8.5 11V6c0-1-0.5-2-1.5-2S5.5 5 5.5 6v8c0 0.5 0 1.5 0.5 2.5" />
    </svg>
  );
}

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useWaves();
  const { conversations } = useConversations();

  const navItems = [
    { icon: Home, label: 'Home', path: '/home' },
    { icon: MessageCircle, label: 'Chat', path: '/chat', badge: conversations.length > 0 ? conversations.length : undefined },
    { icon: WavingHand, label: 'Acenos', path: '/waves', badge: unreadCount },
    { icon: User, label: 'Perfil', path: '/profile' },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border safe-area-inset-bottom z-50 shadow-nav">
      <div className="max-w-md mx-auto flex justify-around items-center h-16">
        {navItems.map(({ icon: Icon, label, path, badge }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full transition-all duration-200 relative",
                isActive 
                  ? "text-katu-blue" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <div className="relative">
                <Icon className={cn(
                  "h-6 w-6 transition-transform duration-200",
                  isActive && "scale-110"
                )} />
                {badge !== undefined && badge > 0 && (
                  <span className="absolute -top-2 -right-3 bg-accent text-accent-foreground text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center font-semibold shadow-sm">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
              <span className={cn(
                "text-xs mt-1 transition-all duration-200",
                isActive && "font-semibold"
              )}>
                {label}
              </span>
              {/* Active indicator line */}
              {isActive && (
                <div className="absolute -top-px left-1/2 -translate-x-1/2 w-12 h-0.5 bg-katu-blue rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
