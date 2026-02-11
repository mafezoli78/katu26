import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { ToastAction } from '@/components/ui/toast';
import { MessageCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  place_id: string;
  origem_wave_id: string | null;
  criado_em: string;
  ativo: boolean;
  encerrado_por: string | null;
  encerrado_em: string | null;
  encerrado_motivo: 'manual' | 'presence_end' | null;
}

export interface ConversationWithDetails extends Conversation {
  otherUser: {
    id: string;
    nome: string | null;
    foto_url: string | null;
  };
  place: {
    id: string;
    nome: string;
  };
}

export function useConversations() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Track known conversation IDs to detect truly new ones
  const knownConversationIds = useRef<Set<string>>(new Set());

  const fetchConversations = useCallback(async () => {
    if (!user) {
      setConversations([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('ativo', true)
        .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
        .order('criado_em', { ascending: false });

      if (error) throw error;

      // Fetch additional details for each conversation
      const conversationsWithDetails: ConversationWithDetails[] = [];
      
      for (const conv of data || []) {
        const otherUserId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
        
        // Get place_id - MUST exist for valid conversations
        const placeId = conv.place_id;
        
        if (!placeId) {
          console.warn(`[useConversations] Conversation ${conv.id} has no place_id, skipping`);
          continue;
        }
        
        const [profileRes, placeRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, nome, foto_url')
            .eq('id', otherUserId)
            .single(),
          supabase
            .from('places')
            .select('id, nome')
            .eq('id', placeId)
            .single()
        ]);

        if (profileRes.data && placeRes.data) {
          conversationsWithDetails.push({
            ...conv,
            otherUser: profileRes.data,
            place: placeRes.data
          });
        } else if (profileRes.data && !placeRes.data) {
          console.warn(`[useConversations] Place ${placeId} not found for conversation ${conv.id}`);
        }
      }

      // Update known IDs after initial fetch
      knownConversationIds.current = new Set(conversationsWithDetails.map(c => c.id));
      
      setConversations(conversationsWithDetails);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Subscribe to new conversations via Realtime
  // This ensures BOTH users get notified when a conversation is created/activated
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('new-conversations')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'conversations',
        },
        async (payload) => {
          const newConv = payload.new as Conversation;
          
          // Check if this conversation involves the current user
          const involvesMe = newConv.user1_id === user.id || newConv.user2_id === user.id;
          if (!involvesMe || !newConv.ativo) return;
          
          // Check if we already know about this conversation (avoid duplicate toasts)
          if (knownConversationIds.current.has(newConv.id)) {
            console.log('[useConversations] Already knew about conversation:', newConv.id);
            return;
          }
          
          // A1 FIX: Suppress Realtime toast for the user who accepted the wave.
          // When a wave is accepted, the acceptor (user2_id) already sees a local
          // "Chat iniciado!" toast from Waves.tsx. Showing the Realtime toast too
          // would be a duplicate. We only show the Realtime toast for the OTHER user
          // (the wave sender, user1_id) who wouldn't otherwise know.
          // NOTE: This assumption is valid as long as the accept flow is unidirectional
          // (only para_user_id can accept, and they become user2_id in the conversation).
          if (newConv.user2_id === user.id) {
            console.log('[useConversations] Suppressing Realtime toast for acceptor (user2_id)');
            knownConversationIds.current.add(newConv.id);
            fetchConversations();
            return;
          }

          console.log('[useConversations] New conversation detected:', newConv.id);
          
          // Add to known IDs immediately to prevent duplicates
          knownConversationIds.current.add(newConv.id);
          
          // Fetch details for the toast
          const otherUserId = newConv.user1_id === user.id ? newConv.user2_id : newConv.user1_id;
          const [profileRes, placeRes] = await Promise.all([
            supabase
              .from('profiles')
              .select('id, nome, foto_url')
              .eq('id', otherUserId)
              .single(),
            supabase
              .from('places')
              .select('id, nome')
              .eq('id', newConv.place_id)
              .single()
          ]);
          
          const otherUserName = profileRes.data?.nome || 'Alguém';
          
          // Show toast notification for BOTH users
          toast({
            title: 'Chat iniciado! 🎉',
            description: `Você agora pode conversar com ${otherUserName}`,
            action: (
              <ToastAction 
                altText="Abrir conversa"
                onClick={() => navigate(`/chat?conversationId=${newConv.id}`)}
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                Abrir chat
              </ToastAction>
            )
          });
          
          // Refetch to update the list with full details
          fetchConversations();
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
  }, [user, fetchConversations, navigate]);

  const addConversation = (conversation: Conversation) => {
    // Mark as known to prevent duplicate toast from realtime
    knownConversationIds.current.add(conversation.id);
    // This is used to add a conversation optimistically after accepting a wave
    // The full details will be fetched on next refetch
    fetchConversations();
  };

  const deactivateConversation = async (conversationId: string) => {
    const { error } = await supabase
      .from('conversations')
      .update({ ativo: false })
      .eq('id', conversationId);

    if (!error) {
      setConversations(prev => prev.filter(c => c.id !== conversationId));
    }

    return { error };
  };

  /**
   * Get conversation with a specific user at a specific place.
   */
  const getConversationWithUser = (otherUserId: string, placeId?: string) => {
    return conversations.find(c => {
      const isMatch = c.otherUser.id === otherUserId;
      if (placeId) {
        return isMatch && c.place_id === placeId;
      }
      return isMatch;
    });
  };

  return {
    conversations,
    loading,
    addConversation,
    deactivateConversation,
    getConversationWithUser,
    refetch: fetchConversations,
  };
}
