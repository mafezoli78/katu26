import { Home, User, MessageCircle } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useWaves } from '@/hooks/useWaves';
import { useConversations } from '@/hooks/useConversations';
import { HandshakeIcon } from '@/components/icons/HandshakeIcon';

export function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const { unreadCount } = useWaves();
  const { conversations } = useConversations();

  const navItems = [
    { icon: Home, label: 'Home', path: '/home' },
    { icon: MessageCircle, label: 'Chat', path: '/chat', badge: conversations.length > 0 ? conversations.length : undefined },
    { icon: HandshakeIcon, label: 'Acenos', path: '/waves', badge: unreadCount },
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
