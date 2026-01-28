import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
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
  const conversationIdParam = searchParams.get('conversationId');
  
  const {
    chatState,
    activeConversations,
    openChat,
    closeChat,
    endChat,
    clearEndedReason,
  } = useChat();

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

  // Show toast when chat ends
  useEffect(() => {
    if (chatState.endedReason) {
      const messages = {
        manual: 'Conversa encerrada',
        presence_end: 'Conversa encerrada (saída do local)',
      };
      
      toast({
        title: messages[chatState.endedReason],
        description: 'As mensagens foram apagadas',
      });
      
      clearEndedReason();
    }
  }, [chatState.endedReason, clearEndedReason]);

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

  // Show full-screen chat when active
  if (chatState.isActive && chatState.conversation) {
    return (
      <ChatWindow
        conversation={chatState.conversation}
        onClose={closeChat}
        onEndChat={handleEndChat}
      />
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
