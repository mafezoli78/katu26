import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useConversations, ConversationWithDetails } from './useConversations';
import { usePresence, PresenceLogicalState } from './usePresence';

export type ConversationEndReason = 'manual' | 'presence_end';

export interface ChatState {
  isActive: boolean;
  conversation: ConversationWithDetails | null;
  endedReason: ConversationEndReason | null;
  wasEndedByMe: boolean; // R3: Track who ended the conversation
}

interface UseChatOptions {
  presenceState: { logicalState: PresenceLogicalState };
  currentPresence: { place_id: string } | null;
}

export function useChat(options?: UseChatOptions) {
  const { user } = useAuth();
  const { conversations, refetch: refetchConversations, deactivateConversation } = useConversations();
  const [chatState, setChatState] = useState<ChatState>({
    isActive: false,
    conversation: null,
    endedReason: null,
    wasEndedByMe: false,
  });
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const previousLogicalState = useRef<PresenceLogicalState | null>(null);

  // CRITICAL: React to presence state transitions
  // When presenceState transitions to 'ended', immediately clear chat state
  useEffect(() => {
    if (!options?.presenceState) return;
    
    const currentLogicalState = options.presenceState.logicalState;
    const prevState = previousLogicalState.current;
    
    // Track state transitions
    if (prevState !== null && prevState !== currentLogicalState) {
      console.log(`[useChat] Presence state transition: ${prevState} → ${currentLogicalState}`);
    }
    
    // If transitioning to 'ended' from any other state, clear chat
    if (currentLogicalState === 'ended' && prevState !== 'ended' && chatState.isActive) {
      console.log('[useChat] Presence ended - clearing active chat (state cleanup)');
      setChatState({
        isActive: false,
        conversation: null,
        endedReason: 'presence_end',
        wasEndedByMe: true, // We lost presence, so technically we "left"
      });
    }
    
    previousLogicalState.current = currentLogicalState;
  }, [options?.presenceState?.logicalState, chatState.isActive]);

  // Also react to currentPresence becoming null (belt and suspenders)
  useEffect(() => {
    if (options && options.currentPresence === null && chatState.isActive) {
      console.log('[useChat] currentPresence is null with active chat - forcing cleanup');
      setChatState({
        isActive: false,
        conversation: null,
        endedReason: 'presence_end',
        wasEndedByMe: true,
      });
    }
  }, [options?.currentPresence, chatState.isActive]);

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
              // R3: Check if it was ended by the other person
              const wasEndedByMe = updated.encerrado_por === user?.id;
              setChatState({
                isActive: false,
                conversation: null,
                endedReason: updated.encerrado_motivo || 'manual',
                wasEndedByMe,
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
      wasEndedByMe: false,
    });
  }, []);

  const closeChat = useCallback(() => {
    setChatState({
      isActive: false,
      conversation: null,
      endedReason: null,
      wasEndedByMe: false,
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

      // R3: We ended it, so wasEndedByMe = true
      setChatState({
        isActive: false,
        conversation: null,
        endedReason: reason,
        wasEndedByMe: true,
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

    // R3: We ended due to presence, so wasEndedByMe = true
    setChatState({
      isActive: false,
      conversation: null,
      endedReason: 'presence_end',
      wasEndedByMe: true,
    });

    refetchConversations();
  }, [user, refetchConversations]);

  const clearEndedReason = useCallback(() => {
    setChatState(prev => ({ ...prev, endedReason: null, wasEndedByMe: false }));
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
