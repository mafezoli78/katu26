import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  InteractionState,
  InteractionResult,
  InteractionButtonConfig,
  deriveFacts,
  getInteractionState,
  getStateName,
} from '@/lib/interactionRules';

/**
 * Hook que calcula o estado de interação entre o usuário atual e outro.
 * 
 * USA A FUNÇÃO CANÔNICA de src/lib/interactionRules.ts
 * NUNCA duplique a lógica de precedência aqui.
 * 
 * @deprecated Prefira importar diretamente de interactionRules.ts quando possível.
 * Este hook existe para manter compatibilidade com componentes existentes.
 */

// Re-export para manter compatibilidade com imports existentes
export { InteractionState } from '@/lib/interactionRules';
export type { InteractionButtonConfig };

export interface InteractionStateResult {
  state: InteractionState;
  stateName: string;
  button: InteractionButtonConfig;
  isVisible: boolean;
}

/**
 * Tipos para dados normalizados (compatibilidade com useInteractionData)
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
  sentWaves: Wave[];
  receivedWaves: Wave[];
  conversations: Conversation[];
  activeMutes: Mute[];
  blocks: Block[];
}

/**
 * Determina o estado de interação entre o usuário atual e outro usuário.
 * 
 * DELEGA para a função canônica getInteractionState() após derivar os fatos.
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
    // Fallback se não há contexto válido
    if (!currentUserId || !otherUserId || !placeId) {
      return {
        state: InteractionState.NONE,
        stateName: 'NONE',
        button: { label: 'Acenar', disabled: true, action: 'none' as const },
        isVisible: true,
      };
    }

    // Preparar dados no formato esperado pela função canônica
    const data = {
      blocks: blocks.map(b => ({
        user_id: b.user_id,
        blocked_user_id: b.blocked_user_id,
      })),
      mutes: activeMutes.map(m => ({
        user_id: m.user_id,
        muted_user_id: m.muted_user_id,
        expira_em: m.expira_em,
      })),
      conversations: conversations.map(c => ({
        id: c.id,
        user1_id: c.user1_id,
        user2_id: c.user2_id,
        place_id: c.place_id,
        ativo: c.ativo,
        encerrado_por: c.encerrado_por,
        reinteracao_permitida_em: c.reinteracao_permitida_em,
      })),
      waves: [
        // Waves enviados
        ...sentWaves.map(w => ({
          id: w.id,
          de_user_id: w.de_user_id,
          para_user_id: w.para_user_id,
          place_id: w.place_id,
          status: w.status,
          expires_at: w.expires_at,
        })),
        // Waves recebidos
        ...receivedWaves.map(w => ({
          id: w.id,
          de_user_id: w.de_user_id,
          para_user_id: w.para_user_id,
          place_id: w.place_id,
          status: w.status,
          expires_at: w.expires_at,
        })),
      ],
    };

    // Derivar fatos e calcular estado usando função canônica
    const facts = deriveFacts(
      currentUserId,
      otherUserId,
      placeId,
      new Date(),
      data
    );

    const result = getInteractionState(facts);

    return {
      state: result.state,
      stateName: result.stateName,
      button: result.button,
      isVisible: result.isVisible,
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
 * @deprecated Use getStateName de interactionRules.ts
 */
export function getInteractionStateName(state: InteractionState): string {
  return getStateName(state);
}
