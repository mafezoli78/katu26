import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Interaction State Machine
 * 
 * 8 estados possíveis para a interação entre dois usuários em um local:
 * 
 * 0 - NONE: Nenhuma interação prévia → "Acenar"
 * 1 - WAVE_SENT: Aceno enviado por mim → "Aceno enviado" (inativo)
 * 2 - WAVE_RECEIVED: Recebi um aceno → "Responder aceno" (redireciona para Acenos)
 * 3 - CHAT_ACTIVE: Conversa ativa → "Chat em andamento" (abre chat)
 * 4 - ENDED_BY_ME: Encerrei a interação → "Interação encerrada" (inativo)
 * 5 - ENDED_BY_OTHER: Outro encerrou → "Interação indisponível" (inativo)
 * 6 - MUTED: Silenciei este usuário → "Silenciado" (24h/local)
 * 7 - BLOCKED: Bloqueei ou fui bloqueado → Usuário invisível (não deve aparecer)
 * 
 * REGRA DE PRECEDÊNCIA:
 * MUTED tem precedência sobre estados de cooldown (ENDED_BY_ME/OTHER).
 * Se o usuário está silenciado, permanece silenciado mesmo que o cooldown
 * da conversa tenha expirado, até que o mute expire (24h) ou seja removido.
 * 
 * DÍVIDA TÉCNICA:
 * Este hook tem forte acoplamento com o modelo atual de `conversations`.
 * Se o modelo evoluir (ex: múltiplas conversas por par/local), será
 * necessário refatorar a lógica de busca e determinação de estado.
 */

export enum InteractionState {
  NONE = 0,
  WAVE_SENT = 1,
  WAVE_RECEIVED = 2,
  CHAT_ACTIVE = 3,
  ENDED_BY_ME = 4,
  ENDED_BY_OTHER = 5,
  MUTED = 6,
  BLOCKED = 7,
}

export interface InteractionButtonConfig {
  label: string;
  disabled: boolean;
  /** Ação a executar: 'wave' | 'open_waves' | 'open_chat' | 'none' */
  action: 'wave' | 'open_waves' | 'open_chat' | 'none';
  /** ID da conversa se aplicável */
  conversationId?: string;
}

export interface InteractionStateResult {
  state: InteractionState;
  stateName: string;
  button: InteractionButtonConfig;
  /** Se o usuário deve ser visível na lista (false se bloqueado) */
  isVisible: boolean;
}

/**
 * IMPORTANTE: Todos os dados devem ser normalizados para usar `place_id` antes
 * de serem passados para este hook. O campo legado `location_id` não é suportado.
 */
interface Wave {
  id: string;
  de_user_id: string;
  para_user_id: string;
  place_id: string;
  status: string;
  expires_at: string | null;
}

interface Conversation {
  id: string;
  user1_id: string;
  user2_id: string;
  place_id: string;
  ativo: boolean;
  encerrado_por: string | null;
  reinteracao_permitida_em: string | null;
}

interface Mute {
  id: string;
  user_id: string;
  muted_user_id: string;
  expira_em: string;
}

interface Block {
  id: string;
  user_id: string;
  blocked_user_id: string;
}

interface UseInteractionStateParams {
  otherUserId: string;
  placeId: string;
  /** 
   * Acenos enviados pelo usuário atual (pendentes, não expirados).
   * IMPORTANTE: Deve conter apenas `place_id`, já normalizado.
   */
  sentWaves: Wave[];
  /** 
   * Acenos recebidos pelo usuário atual (pendentes, não expirados).
   * IMPORTANTE: Deve conter apenas `place_id`, já normalizado.
   */
  receivedWaves: Wave[];
  /** Todas as conversas relevantes (ativas e inativas com reinteracao_permitida_em) */
  conversations: Conversation[];
  /** Silenciamentos ativos do usuário atual */
  activeMutes: Mute[];
  /** Bloqueios envolvendo o usuário atual (como autor ou alvo) */
  blocks: Block[];
}

/**
 * Determina o estado de interação entre o usuário atual e outro usuário.
 * 
 * Ordem de precedência (do mais restritivo para o menos):
 * 1. Bloqueado (bilateral) → invisível
 * 2. Silenciado (unilateral) → visível mas marcado
 * 3. Chat ativo → estado 3
 * 4. Conversa encerrada em cooldown → estados 4/5
 * 5. Aceno recebido → estado 2
 * 6. Aceno enviado → estado 1
 * 7. Nenhuma interação → estado 0
 */
export function useInteractionState({
  otherUserId,
  placeId,
  sentWaves,
  receivedWaves,
  conversations,
  activeMutes,
  blocks,
}: UseInteractionStateParams): InteractionStateResult {
  const { user } = useAuth();
  const currentUserId = user?.id;

  return useMemo(() => {
    // Fallback se não há usuário logado
    if (!currentUserId || !otherUserId || !placeId) {
      return {
        state: InteractionState.NONE,
        stateName: 'NONE',
        button: { label: 'Acenar', disabled: true, action: 'none' },
        isVisible: true,
      };
    }

    // =====================================================
    // 1. BLOQUEIO (bilateral) - prioridade máxima
    // =====================================================
    const isBlocked = blocks.some(
      b =>
        (b.user_id === currentUserId && b.blocked_user_id === otherUserId) ||
        (b.user_id === otherUserId && b.blocked_user_id === currentUserId)
    );

    if (isBlocked) {
      return {
        state: InteractionState.BLOCKED,
        stateName: 'BLOCKED',
        button: { label: 'Bloqueado', disabled: true, action: 'none' },
        isVisible: false, // ÚNICO estado que oculta o card - bloqueio bilateral
      };
    }

    // =====================================================
    // 2. SILENCIAMENTO (assimétrico) - eu silenciei o outro
    // =====================================================
    const now = new Date();
    const isMuted = activeMutes.some(
      m =>
        m.user_id === currentUserId &&
        m.muted_user_id === otherUserId &&
        new Date(m.expira_em) > now
    );

    if (isMuted) {
      return {
        state: InteractionState.MUTED,
        stateName: 'MUTED',
        button: { label: 'Silenciado', disabled: true, action: 'none' },
        isVisible: true, // Continua visível, mas marcado
      };
    }

    // =====================================================
    // 3. CONVERSAS - verificar estado atual
    // =====================================================
    // Buscar conversa neste local específico
    const conversation = conversations.find(
      c =>
        c.place_id === placeId &&
        ((c.user1_id === currentUserId && c.user2_id === otherUserId) ||
          (c.user1_id === otherUserId && c.user2_id === currentUserId))
    );

    if (conversation) {
      // 3a. Chat ativo
      if (conversation.ativo) {
        return {
          state: InteractionState.CHAT_ACTIVE,
          stateName: 'CHAT_ACTIVE',
          button: {
            label: 'Chat em andamento',
            disabled: false,
            action: 'open_chat',
            conversationId: conversation.id,
          },
          isVisible: true,
        };
      }

      // 3b. Conversa encerrada - verificar cooldown
      const cooldownEnd = conversation.reinteracao_permitida_em
        ? new Date(conversation.reinteracao_permitida_em)
        : null;
      const inCooldown = cooldownEnd && cooldownEnd > now;

      if (inCooldown) {
        // Quem encerrou?
        const endedByMe = conversation.encerrado_por === currentUserId;

        if (endedByMe) {
          return {
            state: InteractionState.ENDED_BY_ME,
            stateName: 'ENDED_BY_ME',
            button: {
              label: 'Interação encerrada',
              disabled: true,
              action: 'none',
              conversationId: conversation.id,
            },
            isVisible: true,
          };
        } else {
          return {
            state: InteractionState.ENDED_BY_OTHER,
            stateName: 'ENDED_BY_OTHER',
            button: {
              label: 'Interação indisponível',
              disabled: true,
              action: 'none',
              conversationId: conversation.id,
            },
            isVisible: true,
          };
        }
      }
      // Se fora do cooldown, tratamos como se não houvesse conversa prévia
    }

    // =====================================================
    // 4. ACENOS - verificar pendentes neste local
    // =====================================================
    // Aceno que EU recebi deste usuário
    // NOTA: Dados devem ser normalizados para place_id antes de passar para o hook
    const receivedWave = receivedWaves.find(
      w =>
        w.de_user_id === otherUserId &&
        w.place_id === placeId &&
        w.status === 'pending' &&
        (!w.expires_at || new Date(w.expires_at) > now)
    );

    if (receivedWave) {
      return {
        state: InteractionState.WAVE_RECEIVED,
        stateName: 'WAVE_RECEIVED',
        button: {
          label: 'Responder aceno',
          disabled: false,
          action: 'open_waves',
        },
        isVisible: true,
      };
    }

    // Aceno que EU enviei para este usuário
    // NOTA: Dados devem ser normalizados para place_id antes de passar para o hook
    const sentWave = sentWaves.find(
      w =>
        w.para_user_id === otherUserId &&
        w.place_id === placeId &&
        w.status === 'pending' &&
        (!w.expires_at || new Date(w.expires_at) > now)
    );

    if (sentWave) {
      return {
        state: InteractionState.WAVE_SENT,
        stateName: 'WAVE_SENT',
        button: {
          label: 'Aceno enviado',
          disabled: true,
          action: 'none',
        },
        isVisible: true,
      };
    }

    // =====================================================
    // 5. NENHUMA INTERAÇÃO
    // =====================================================
    return {
      state: InteractionState.NONE,
      stateName: 'NONE',
      button: {
        label: 'Acenar',
        disabled: false,
        action: 'wave',
      },
      isVisible: true,
    };
  }, [
    currentUserId,
    otherUserId,
    placeId,
    sentWaves,
    receivedWaves,
    conversations,
    activeMutes,
    blocks,
  ]);
}

/**
 * Helper para obter o nome legível do estado
 */
export function getInteractionStateName(state: InteractionState): string {
  const names: Record<InteractionState, string> = {
    [InteractionState.NONE]: 'Nenhuma interação',
    [InteractionState.WAVE_SENT]: 'Aceno enviado',
    [InteractionState.WAVE_RECEIVED]: 'Aceno recebido',
    [InteractionState.CHAT_ACTIVE]: 'Chat ativo',
    [InteractionState.ENDED_BY_ME]: 'Encerrado por mim',
    [InteractionState.ENDED_BY_OTHER]: 'Encerrado pelo outro',
    [InteractionState.MUTED]: 'Silenciado',
    [InteractionState.BLOCKED]: 'Bloqueado',
  };
  return names[state];
}
