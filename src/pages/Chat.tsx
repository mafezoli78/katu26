import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { usePresence } from '@/hooks/usePresence';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ConversationsList } from '@/components/chat/ConversationsList';
import { toast } from '@/hooks/use-toast';
import { MessageCircle, MessageSquare } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isKeyboardVisible = useKeyboardVisible();
  const conversationIdParam = searchParams.get('conversationId');
  
  // Get presence state to pass to useChat
  const { presenceState, currentPresence } = usePresence();
  
  const {
    chatState,
    activeConversations,
    openChat,
    closeChat,
    endChat,
    clearEndedReason,
  } = useChat({ presenceState, currentPresence });

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  // Auto-open conversation from query param
  useEffect(() => {
    if (!conversationIdParam || chatState.isActive) return;
    
    const targetConversation = activeConversations.find(
      c => c.id === conversationIdParam
    );
    
    if (targetConversation) {
      openChat(targetConversation);
      // Clear query param to prevent re-triggering
      setSearchParams({}, { replace: true });
    }
  }, [conversationIdParam, activeConversations, chatState.isActive, openChat, setSearchParams]);

  // R3: Show toast when chat ends - transition guard prevents duplicates
  // Only fires on transition from NOT ended → ended (ref tracks previous state)
  const previousEndedRef = useRef<string | null>(null);
  
  useEffect(() => {
    const currentReason = chatState.endedReason;
    
    // Only show toast on real transition: previous was null, current is a terminal reason
    // "Ended by other" toast is now handled directly in useChat Realtime handler
    if (previousEndedRef.current === null && currentReason && currentReason !== 'system_suspended' && chatState.wasEndedByMe) {
      toast({
        title: 'Conversa encerrada por você',
        description: 'As mensagens foram apagadas',
      });
    }
    
    // Always sync ref to current value (prevents re-fire on Realtime re-set)
    previousEndedRef.current = currentReason;
    
    // Reset ref when reason is cleared (prepares for next conversation)
    if (currentReason === null) {
      previousEndedRef.current = null;
    }
  }, [chatState.endedReason, chatState.wasEndedByMe]);

  const handleEndChat = async () => {
    const { error } = await endChat('manual');
    if (error) {
      toast({
        title: 'Erro ao encerrar conversa',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  // Show chat within MobileLayout when active
  if (chatState.isActive && chatState.conversation) {
    return (
      <MobileLayout showHeader={false} showNav={!isKeyboardVisible} fixedHeight>
        <ChatWindow
          conversation={chatState.conversation}
          onClose={closeChat}
          onEndChat={handleEndChat}
        />
      </MobileLayout>
    );
  }

  return (
    <MobileLayout>
      <div className="p-4 page-fade">
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="h-5 w-5 text-katu-blue" />
          <h1 className="text-xl font-bold">Conversas</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Conversas ativas com pessoas no mesmo local
        </p>

        {activeConversations.length === 0 ? (
          <Card className="border-0 shadow-sm">
            <CardContent className="py-10 text-center">
              <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageSquare className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">Nenhuma conversa ativa</p>
              <p className="text-sm text-muted-foreground mt-1">
                Quando alguém aceitar seu aceno, a conversa aparecerá aqui
              </p>
            </CardContent>
          </Card>
        ) : (
          <ConversationsList
            conversations={activeConversations}
            onSelectConversation={openChat}
          />
        )}
      </div>
    </MobileLayout>
  );
}
