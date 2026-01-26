import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  place_id: string;
  origem_wave_id: string | null;
  criado_em: string;
  ativo: boolean;
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
  const [conversations, setConversations] = useState<ConversationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

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
        
        const [profileRes, placeRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('id, nome, foto_url')
            .eq('id', otherUserId)
            .single(),
          supabase
            .from('places')
            .select('id, nome')
            .eq('id', conv.place_id)
            .single()
        ]);

        if (profileRes.data && placeRes.data) {
          conversationsWithDetails.push({
            ...conv,
            otherUser: profileRes.data,
            place: placeRes.data
          });
        }
      }

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

  const addConversation = (conversation: Conversation) => {
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
