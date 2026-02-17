import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Tracks unread message counts for conversations.
 * Uses in-memory tracking of the last-seen timestamp per conversation.
 * When a conversation is opened, all its messages are marked as read.
 */
export function useUnreadMessages(conversationIds: string[]) {
  const { user } = useAuth();
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  // Track last-read timestamp per conversation (in-memory, ephemeral like the chats)
  const lastReadAt = useRef<Record<string, string>>({});

  const fetchUnreadCounts = useCallback(async () => {
    if (!user || conversationIds.length === 0) {
      setUnreadCounts({});
      return;
    }

    const counts: Record<string, number> = {};

    for (const convId of conversationIds) {
      const readAt = lastReadAt.current[convId];

      let query = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', convId)
        .neq('sender_id', user.id);

      if (readAt) {
        query = query.gt('criado_em', readAt);
      }

      const { count } = await query;
      counts[convId] = count || 0;
    }

    setUnreadCounts(counts);
  }, [user, conversationIds.join(',')]);

  // Fetch on mount and when conversations change
  useEffect(() => {
    fetchUnreadCounts();
  }, [fetchUnreadCounts]);

  // Realtime: listen for new messages across all conversations
  useEffect(() => {
    if (!user || conversationIds.length === 0) return;

    const channel = supabase
      .channel('unread-messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_id !== user.id && conversationIds.includes(msg.conversation_id)) {
          // Check if this conversation is currently being read
          const readAt = lastReadAt.current[msg.conversation_id];
          if (!readAt || msg.criado_em > readAt) {
            setUnreadCounts(prev => ({
              ...prev,
              [msg.conversation_id]: (prev[msg.conversation_id] || 0) + 1,
            }));
          }
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, conversationIds.join(',')]);

  // Mark a conversation as read (call when opening a chat)
  const markAsRead = useCallback((conversationId: string) => {
    lastReadAt.current[conversationId] = new Date().toISOString();
    setUnreadCounts(prev => ({ ...prev, [conversationId]: 0 }));
  }, []);

  // Total unread across all conversations
  const totalUnread = Object.values(unreadCounts).reduce((sum, c) => sum + c, 0);

  return {
    unreadCounts,
    totalUnread,
    markAsRead,
  };
}
