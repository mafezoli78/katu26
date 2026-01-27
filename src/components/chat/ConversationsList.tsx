import { ConversationWithDetails } from '@/hooks/useConversations';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { MessageCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface ConversationsListProps {
  conversations: ConversationWithDetails[];
  onSelectConversation: (conversation: ConversationWithDetails) => void;
}

export function ConversationsList({ conversations, onSelectConversation }: ConversationsListProps) {
  if (conversations.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <p className="text-muted-foreground">Nenhuma conversa ativa</p>
          <p className="text-sm text-muted-foreground mt-1">
            Aceite um aceno para iniciar uma conversa
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {conversations.map((conversation) => (
        <Card
          key={conversation.id}
          className="cursor-pointer hover:bg-accent/10 transition-colors touch-active"
          onClick={() => onSelectConversation(conversation)}
        >
          <CardContent className="p-4 flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarImage src={conversation.otherUser.foto_url || undefined} />
              <AvatarFallback className="bg-secondary text-secondary-foreground">
                {conversation.otherUser.nome?.[0]?.toUpperCase() || '?'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">
                {conversation.otherUser.nome || 'Usuário'}
              </p>
              <p className="text-sm text-muted-foreground truncate">
                {conversation.place.nome}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(conversation.criado_em), {
                  addSuffix: true,
                  locale: ptBR,
                })}
              </p>
            </div>
            <MessageCircle className="h-5 w-5 text-primary" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
