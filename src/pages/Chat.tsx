import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useChat } from '@/hooks/useChat';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ConversationsList } from '@/components/chat/ConversationsList';
import { toast } from '@/hooks/use-toast';
import { MessageCircle } from 'lucide-react';

export default function Chat() {
  const { user } = useAuth();
  const navigate = useNavigate();
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
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Conversas</h1>
        </div>

        <p className="text-sm text-muted-foreground mb-4">
          Conversas ativas com pessoas no mesmo local
        </p>

        <ConversationsList
          conversations={activeConversations}
          onSelectConversation={openChat}
        />
      </div>
    </MobileLayout>
  );
}
