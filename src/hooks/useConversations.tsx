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
    checkin_selfie_url: string | null;
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
        
        const [profileRes, placeRes, presenceRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, nome, foto_url')
            .eq('id', otherUserId)
            .single(),
          supabase
            .from('places')
            .select('id, nome')
            .eq('id', placeId)
            .single(),
          supabase
            .from('presence')
            .select('checkin_selfie_url')
            .eq('user_id', otherUserId)
            .eq('ativo', true)
            .maybeSingle()
        ]);

        if (profileRes.data && placeRes.data) {
          conversationsWithDetails.push({
            ...conv,
            otherUser: {
              ...profileRes.data,
              checkin_selfie_url: presenceRes.data?.checkin_selfie_url || null,
            },
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

  // Layer 1: Polling fallback (15s) with visibility check
  useEffect(() => {
    if (!user) return;

    let debounceTimeout: NodeJS.Timeout;

    const debouncedRefetch = () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(() => {
        fetchConversations();
      }, 500);
    };

    const intervalId = setInterval(() => {
      if (!document.hidden) {
        debouncedRefetch();
      }
    }, 15000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(debounceTimeout);
    };
  }, [user, fetchConversations]);

  // Layer 2: Realtime subscription for INSERT and UPDATE
  useEffect(() => {
    if (!user) return;

    let debounceTimeout: NodeJS.Timeout;

    const handleRealtimeEvent = async (eventType: string, payload: any) => {
      const conv = payload.new as Conversation;
      console.log(`[Realtime] ${eventType} conversation:`, conv.id);

      const involvesMe = conv.user1_id === user.id || conv.user2_id === user.id;
      if (!involvesMe) return;

      // Debounce to group multiple events
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(async () => {
        // Check if truly new for toast purposes
        if (eventType === 'INSERT' && !knownConversationIds.current.has(conv.id) && conv.ativo) {
          knownConversationIds.current.add(conv.id);

          // Suppress toast for acceptor (already shown locally)
          if (conv.user2_id === user.id) {
            console.log('[Realtime] Suppressing toast for acceptor');
            fetchConversations();
            return;
          }

          // Show toast for wave sender
          const otherUserId = conv.user1_id === user.id ? conv.user2_id : conv.user1_id;
          const { data: profileData } = await supabase
            .from('profiles')
            .select('nome')
            .eq('id', otherUserId)
            .single();

          toast({
            title: 'Chat iniciado! 🎉',
            description: `Você agora pode conversar com ${profileData?.nome || 'Alguém'}`,
            action: (
              <ToastAction
                altText="Abrir conversa"
                onClick={() => navigate(`/chat?conversationId=${conv.id}`)}
              >
                <MessageCircle className="h-4 w-4 mr-1" />
                Abrir chat
              </ToastAction>
            )
          });
        }

        fetchConversations();
      }, 500);
    };

    const channel = supabase
      .channel('conversations-updates')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations'
      }, (payload) => handleRealtimeEvent('INSERT', payload))
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations'
      }, (payload) => handleRealtimeEvent('UPDATE', payload))
      .subscribe((status) => {
        console.log('[Realtime] Conversations subscription:', status);
      });

    channelRef.current = channel;

    return () => {
      clearTimeout(debounceTimeout);
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
