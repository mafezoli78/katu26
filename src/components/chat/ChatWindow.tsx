import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useMessages } from '@/hooks/useMessages';
import { ConversationWithDetails } from '@/hooks/useConversations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { X, Send, Loader2, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
interface ChatWindowProps {
  conversation: ConversationWithDetails;
  onClose: () => void;
  onEndChat: () => void;
}
export function ChatWindow({
  conversation,
  onClose,
  onEndChat
}: ChatWindowProps) {
  const {
    user
  } = useAuth();
  const {
    messages,
    loading,
    sending,
    sendMessage
  } = useMessages(conversation.id);
  const [inputValue, setInputValue] = useState('');
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);
  const handleSend = async () => {
    if (!inputValue.trim() || sending) return;
    const content = inputValue;
    setInputValue('');
    const {
      error
    } = await sendMessage(content);
    if (error) {
      setInputValue(content); // Restore on error
    }
  };
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  const handleEndChat = () => {
    if (showEndConfirm) {
      onEndChat();
    } else {
      setShowEndConfirm(true);
      // Reset confirm after 3 seconds
      setTimeout(() => setShowEndConfirm(false), 3000);
    }
  };
  return <div className="fixed inset-0 z-20 bg-background flex flex-col">
      {/* Header - fixed structure, never moves */}
      <div className="flex-shrink-0 flex items-center justify-between p-4 border-b bg-card z-30">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={conversation.otherUser.foto_url || undefined} />
            <AvatarFallback className="bg-secondary text-secondary-foreground">
              {conversation.otherUser.nome?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="font-medium">{conversation.otherUser.nome || 'Usuário'}</p>
            <p className="text-xs text-muted-foreground">
              {conversation.place.nome}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={showEndConfirm ? "destructive" : "ghost"} size="sm" onClick={handleEndChat}>
            {showEndConfirm ? <>
                <AlertCircle className="h-4 w-4 mr-1" />
                Confirmar
              </> : 'Encerrar'}
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Messages - fills remaining space */}
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        {loading ? <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div> : messages.length === 0 ? <div className="flex flex-col items-center justify-center h-32 text-center">
            <p className="text-muted-foreground">Nenhuma mensagem ainda</p>
            <p className="text-sm text-muted-foreground mt-1">
              Diga olá para iniciar a conversa! 👋
            </p>
          </div> : <div className="space-y-3">
            {messages.map(message => {
          const isOwn = message.sender_id === user?.id;
          return <div key={message.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${isOwn ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm'}`}>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {message.conteudo}
                    </p>
                    <p className={`text-xs mt-1 ${isOwn ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                      {formatDistanceToNow(new Date(message.criado_em), {
                  addSuffix: true,
                  locale: ptBR
                })}
                    </p>
                  </div>
                </div>;
        })}
          </div>}
      </ScrollArea>

      {/* Input - anchored to bottom of this fixed container */}
      <div className="flex-shrink-0 p-4 border-t bg-card">
        <div className="flex items-center gap-2">
          <Input value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyPress={handleKeyPress} placeholder="Digite sua mensagem..." disabled={sending} className="flex-1" />
          <Button size="icon" onClick={handleSend} disabled={!inputValue.trim() || sending}>
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>;
}