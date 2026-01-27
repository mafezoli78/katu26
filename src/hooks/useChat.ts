import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, ConversationWithDetails } from './useConversations';

export type ConversationEndReason = 'manual' | 'presence_end';

export interface ChatState {
  isActive: boolean;
  conversation: ConversationWithDetails | null;
  endedReason: ConversationEndReason | null;
}

export function useChat() {
  const { user } = useAuth();
  const { conversations, refetch: refetchConversations, deactivateConversation } = useConversations();
  const [chatState, setChatState] = useState<ChatState>({
    isActive: false,
    conversation: null,
    endedReason: null,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subscribe to conversation changes (for real-time updates when other user ends chat)
  useEffect(() => {
    if (!user || conversations.length === 0) return;

    const conversationIds = conversations.map(c => c.id);
    
    const channel = supabase
      .channel('conversations-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'conversations',
        },
        (payload) => {
          const updated = payload.new as any;
          
          // Check if this is one of our conversations and it was deactivated
          if (conversationIds.includes(updated.id) && !updated.ativo) {
            console.log('[useChat] Conversation deactivated:', updated.id);
            
            // If this was the active conversation, update state
            if (chatState.conversation?.id === updated.id) {
              setChatState({
                isActive: false,
                conversation: null,
                endedReason: updated.encerrado_motivo || 'manual',
              });
            }
            
            // Refetch conversations to update the list
            refetchConversations();
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [user, conversations, chatState.conversation?.id, refetchConversations]);

  const openChat = useCallback((conversation: ConversationWithDetails) => {
    // Validate that conversation has a valid place_id
    if (!conversation.place_id) {
      console.error('[useChat] Cannot open chat: conversation has no place_id');
      return;
    }
    
    setChatState({
      isActive: true,
      conversation,
      endedReason: null,
    });
  }, []);

  const closeChat = useCallback(() => {
    setChatState({
      isActive: false,
      conversation: null,
      endedReason: null,
    });
  }, []);

  const endChat = useCallback(async (reason: ConversationEndReason = 'manual') => {
    if (!chatState.conversation || !user) return { error: new Error('No active chat') };

    const conversationId = chatState.conversation.id;

    try {
      // Update conversation with end info
      const { error } = await supabase
        .from('conversations')
        .update({
          ativo: false,
          encerrado_por: user.id,
          encerrado_em: new Date().toISOString(),
          encerrado_motivo: reason,
        })
        .eq('id', conversationId);

      if (error) throw error;

      // Delete all messages for this conversation (ephemeral)
      await supabase
        .from('messages')
        .delete()
        .eq('conversation_id', conversationId);

      console.log('[useChat] Chat ended:', reason);

      setChatState({
        isActive: false,
        conversation: null,
        endedReason: reason,
      });

      // Refetch to update conversation list
      refetchConversations();

      return { error: null };
    } catch (error) {
      console.error('[useChat] Error ending chat:', error);
      return { error: error as Error };
    }
  }, [chatState.conversation, user, refetchConversations]);

  // Called when presence ends (from usePresence)
  const endAllChatsForPresence = useCallback(async (placeId?: string) => {
    if (!user) return;

    console.log('[useChat] Ending all chats due to presence end', placeId ? `at place ${placeId}` : '');

    // Build query for active conversations
    let query = supabase
      .from('conversations')
      .select('id')
      .eq('ativo', true)
      .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`);

    // Filter by place_id if provided
    if (placeId) {
      query = query.eq('place_id', placeId);
    }

    const { data: activeConversations } = await query;

    if (activeConversations && activeConversations.length > 0) {
      for (const conv of activeConversations) {
        // Update conversation
        await supabase
          .from('conversations')
          .update({
            ativo: false,
            encerrado_por: user.id,
            encerrado_em: new Date().toISOString(),
            encerrado_motivo: 'presence_end',
          })
          .eq('id', conv.id);

        // Delete messages (ephemeral)
        await supabase
          .from('messages')
          .delete()
          .eq('conversation_id', conv.id);
      }
    }

    setChatState({
      isActive: false,
      conversation: null,
      endedReason: 'presence_end',
    });

    refetchConversations();
  }, [user, refetchConversations]);

  const clearEndedReason = useCallback(() => {
    setChatState(prev => ({ ...prev, endedReason: null }));
  }, []);

  return {
    chatState,
    activeConversations: conversations,
    openChat,
    closeChat,
    endChat,
    endAllChatsForPresence,
    clearEndedReason,
    refetchConversations,
  };
}
