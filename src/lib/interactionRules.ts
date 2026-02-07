/**
 * INTERACTION RULES - Canonical Source of Truth
 * 
 * Este arquivo define a regra única e canônica para determinar
 * o estado de interação entre dois usuários em um local.
 * 
 * DEVE SER USADO POR:
 * - useInteractionState (UI labels/buttons)
 * - sendWave (validação de ação)
 * - acceptWave (validação de ação)
 * 
 * NUNCA duplique esta lógica em outro lugar.
 */

// ============================================================================
// TIPOS E ENUMS
// ============================================================================

/**
 * Estados possíveis de interação entre dois usuários.
 * A ordem numérica reflete a precedência (maior = mais restritivo).
 */
export enum InteractionState {
  NONE = 0,           // Nenhuma interação → "Acenar"
  WAVE_SENT = 1,      // Aceno enviado por mim → "Aceno enviado" (inativo)
  WAVE_RECEIVED = 2,  // Recebi um aceno → "Responder aceno"
  CHAT_ACTIVE = 3,    // Conversa ativa → "Chat em andamento"
  ENDED_BY_ME = 4,    // Encerrei a interação → "Interação encerrada" (inativo)
  ENDED_BY_OTHER = 5, // Outro encerrou → "Interação indisponível" (inativo)
  MUTED = 6,          // Silenciei este usuário → "Silenciado" (24h)
  BLOCKED = 7,        // Bloqueio bilateral → Usuário invisível
}

/**
 * Fatos booleanos mínimos para determinar o estado.
 * Derivados dos dados do banco, sem lógica de negócio.
 */
export interface InteractionFacts {
  /** @deprecated Use isBlockedByMe || isBlockedByOther */
  isBlocked: boolean;
  /** A bloqueou B (eu criei o bloqueio) */
  isBlockedByMe: boolean;
  /** B bloqueou A (o outro me bloqueou) */
  isBlockedByOther: boolean;
  /** A silenciou B E mute não expirou */
  isMutedByA: boolean;
  /** Existe conversa ativa entre A↔B neste place */
  hasActiveChat: boolean;
  /** Existe conversa encerrada com cooldown ativo */
  hasCooldown: boolean;
  /** Se hasCooldown, A foi quem encerrou */
  cooldownByA: boolean;
  /** Existe qualquer conversa (ativa ou não) entre A↔B neste place */
  hasAnyConversation: boolean;
  /** Se hasAnyConversation e não ativa, A foi quem encerrou */
  closedByA: boolean;
  /** Existe wave pendente de B→A (não expirado) */
  hasWaveFromB: boolean;
  /** Existe wave pendente de A→B (não expirado) */
  hasWaveFromA: boolean;
  /** ID da conversa (se existir) */
  conversationId?: string;
}

/**
 * Configuração do botão baseada no estado.
 */
export interface InteractionButtonConfig {
  label: string;
  disabled: boolean;
  action: 'wave' | 'open_waves' | 'open_chat' | 'none';
  conversationId?: string;
}

/**
 * Resultado completo do cálculo de estado.
 */
export interface InteractionResult {
  state: InteractionState;
  stateName: string;
  button: InteractionButtonConfig;
  isVisible: boolean;
  /** Razão para bloqueio de ação (se aplicável) */
  blockReason?: string;
}

// ============================================================================
// FUNÇÃO PURA: CÁLCULO DE ESTADO
// ============================================================================

/**
 * Calcula o estado de interação baseado APENAS em fatos booleanos.
 * 
 * PRECEDÊNCIA (do mais restritivo para o menos):
 * 1. isBlocked      → BLOCKED (invisível)
 * 2. isMutedByA     → MUTED
 * 3. hasActiveChat  → CHAT_ACTIVE
 * 4. hasCooldown    → ENDED_BY_ME ou ENDED_BY_OTHER
 * 5. hasWaveFromB   → WAVE_RECEIVED
 * 6. hasWaveFromA   → WAVE_SENT
 * 7. (nenhum)       → NONE
 * 
 * @param facts - Fatos booleanos derivados dos dados
 * @returns Estado de interação com configuração de botão
 */
export function getInteractionState(facts: InteractionFacts): InteractionResult {
  // 1. BLOQUEIO - prioridade máxima
  // I3 FIX: Differentiate block direction for visibility
  if (facts.isBlockedByOther) {
    // The other user blocked me → I'm invisible to them, card hidden for me
    return {
      state: InteractionState.BLOCKED,
      stateName: 'BLOCKED',
      button: { label: 'Bloqueado', disabled: true, action: 'none' },
      isVisible: false,
      blockReason: 'Usuário bloqueado',
    };
  }
  if (facts.isBlockedByMe) {
    // I blocked the other user → card stays visible for me (to allow unblock)
    return {
      state: InteractionState.BLOCKED,
      stateName: 'BLOCKED',
      button: { label: 'Bloqueado', disabled: true, action: 'none' },
      isVisible: true,
      blockReason: 'Você bloqueou este usuário',
    };
  }

  // 2. SILENCIAMENTO - visível mas inativo
  if (facts.isMutedByA) {
    return {
      state: InteractionState.MUTED,
      stateName: 'MUTED',
      button: { label: 'Silenciado', disabled: true, action: 'none' },
      isVisible: true,
      blockReason: 'Usuário silenciado por 24h',
    };
  }

  // 3. CHAT ATIVO - pode abrir conversa
  if (facts.hasActiveChat) {
    return {
      state: InteractionState.CHAT_ACTIVE,
      stateName: 'CHAT_ACTIVE',
      button: {
        label: 'Chat em andamento',
        disabled: false,
        action: 'open_chat',
        conversationId: facts.conversationId,
      },
      isVisible: true,
    };
  }

  // 4. COOLDOWN - encerrado recentemente
  if (facts.hasCooldown) {
    if (facts.cooldownByA) {
      return {
        state: InteractionState.ENDED_BY_ME,
        stateName: 'ENDED_BY_ME',
        button: {
          label: 'Interação encerrada',
          disabled: true,
          action: 'none',
          conversationId: facts.conversationId,
        },
        isVisible: true,
        blockReason: 'Você encerrou esta interação',
      };
    } else {
      return {
        state: InteractionState.ENDED_BY_OTHER,
        stateName: 'ENDED_BY_OTHER',
        button: {
          label: 'Interação indisponível',
          disabled: true,
          action: 'none',
          conversationId: facts.conversationId,
        },
        isVisible: true,
        blockReason: 'O outro usuário encerrou a interação',
      };
    }
  }

  // 5. COOLDOWN EXPIRADO - após 24h, libera nova interação
  // Se havia conversa mas cooldown já expirou, permite acenar novamente (cai para NONE)

  // 6. WAVE RECEBIDO - pode responder
  if (facts.hasWaveFromB) {
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

  // 7. WAVE ENVIADO - aguardando resposta
  if (facts.hasWaveFromA) {
    return {
      state: InteractionState.WAVE_SENT,
      stateName: 'WAVE_SENT',
      button: {
        label: 'Aceno enviado',
        disabled: true,
        action: 'none',
      },
      isVisible: true,
      blockReason: 'Aguardando resposta do aceno',
    };
  }

  // 8. NENHUMA INTERAÇÃO - pode acenar
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
}

// ============================================================================
// DERIVAÇÃO DE FATOS A PARTIR DE DADOS
// ============================================================================

/**
 * Tipos mínimos para os dados do banco.
 * Usados para derivar os fatos booleanos.
 */
export interface BlockRecord {
  user_id: string;
  blocked_user_id: string;
}

export interface MuteRecord {
  user_id: string;
  muted_user_id: string;
  expira_em: string;
}

export interface ConversationRecord {
  id: string;
  user1_id: string;
  user2_id: string;
  place_id: string;
  ativo: boolean;
  encerrado_por: string | null;
  reinteracao_permitida_em: string | null;
}

export interface WaveRecord {
  id: string;
  de_user_id: string;
  para_user_id: string;
  place_id: string;
  status: string;
  expires_at: string | null;
}

export interface InteractionData {
  blocks: BlockRecord[];
  mutes: MuteRecord[];
  conversations: ConversationRecord[];
  waves: WaveRecord[];
}

/**
 * Deriva fatos booleanos a partir dos dados do banco.
 * 
 * @param userA - ID do usuário atual (perspectiva)
 * @param userB - ID do outro usuário
 * @param placeId - ID do local atual
 * @param now - Timestamp atual para comparações
 * @param data - Dados do banco (blocks, mutes, conversations, waves)
 * @returns Fatos booleanos para cálculo de estado
 */
export function deriveFacts(
  userA: string,
  userB: string,
  placeId: string,
  now: Date,
  data: InteractionData
): InteractionFacts {
  // 1. BLOQUEIO - directional (I3 FIX)
  const isBlockedByMe = data.blocks.some(
    b => b.user_id === userA && b.blocked_user_id === userB
  );
  const isBlockedByOther = data.blocks.some(
    b => b.user_id === userB && b.blocked_user_id === userA
  );
  const isBlocked = isBlockedByMe || isBlockedByOther;

  // 2. SILENCIAMENTO - assimétrico (A silenciou B, não expirado)
  const isMutedByA = data.mutes.some(
    m =>
      m.user_id === userA &&
      m.muted_user_id === userB &&
      new Date(m.expira_em) > now
  );

  // 3. CONVERSAS - buscar conversa MAIS RELEVANTE neste local
  // Quando há múltiplas conversas entre o mesmo par no mesmo local,
  // priorizar: ativa > cooldown válido > mais recente
  const pairConversations = data.conversations
    .filter(
      c =>
        c.place_id === placeId &&
        ((c.user1_id === userA && c.user2_id === userB) ||
          (c.user1_id === userB && c.user2_id === userA))
    )
    .sort((a, b) => {
      // 1. Ativa sempre vem primeiro
      if (a.ativo && !b.ativo) return -1;
      if (!a.ativo && b.ativo) return 1;
      // 2. Cooldown válido vem antes de expirado
      const aCooldown = a.reinteracao_permitida_em && new Date(a.reinteracao_permitida_em) > now;
      const bCooldown = b.reinteracao_permitida_em && new Date(b.reinteracao_permitida_em) > now;
      if (aCooldown && !bCooldown) return -1;
      if (!aCooldown && bCooldown) return 1;
      return 0;
    });
  const conversation = pairConversations[0] ?? undefined;

  const hasActiveChat = conversation?.ativo === true;
  const hasAnyConversation = conversation !== undefined;
  const closedByA = hasAnyConversation && !conversation.ativo && conversation.encerrado_por === userA;

  // 4. COOLDOWN - conversa encerrada com reinteração bloqueada
  const cooldownEnd = conversation?.reinteracao_permitida_em
    ? new Date(conversation.reinteracao_permitida_em)
    : null;
  const hasCooldown = !hasActiveChat && cooldownEnd !== null && cooldownEnd > now;
  const cooldownByA = hasCooldown && conversation?.encerrado_por === userA;

  // 5. WAVES - buscar acenos pendentes não expirados
  const validWaves = data.waves.filter(
    w =>
      w.place_id === placeId &&
      w.status === 'pending' &&
      (!w.expires_at || new Date(w.expires_at) > now)
  );

  const hasWaveFromB = validWaves.some(
    w => w.de_user_id === userB && w.para_user_id === userA
  );

  const hasWaveFromA = validWaves.some(
    w => w.de_user_id === userA && w.para_user_id === userB
  );

  return {
    isBlocked,
    isBlockedByMe,
    isBlockedByOther,
    isMutedByA,
    hasActiveChat,
    hasCooldown,
    cooldownByA,
    hasAnyConversation,
    closedByA,
    hasWaveFromB,
    hasWaveFromA,
    conversationId: conversation?.id,
  };
}

// ============================================================================
// VALIDAÇÃO DE AÇÕES
// ============================================================================

/**
 * Verifica se uma ação de "acenar" é permitida.
 * Usado por sendWave para validação.
 * 
 * @param facts - Fatos derivados
 * @returns { allowed: boolean, reason?: string }
 */
export function canWave(facts: InteractionFacts): { allowed: boolean; reason?: string } {
  if (facts.isBlockedByMe || facts.isBlockedByOther) {
    return { allowed: false, reason: 'Usuário bloqueado' };
  }
  if (facts.isMutedByA) {
    return { allowed: false, reason: 'Usuário silenciado' };
  }
  if (facts.hasActiveChat) {
    return { allowed: false, reason: 'Você já tem uma conversa ativa com esta pessoa' };
  }
  if (facts.hasCooldown) {
    return { allowed: false, reason: 'Não é possível acenar - interação recente neste local' };
  }
  if (facts.hasWaveFromA) {
    return { allowed: false, reason: 'Você já acenou para esta pessoa neste local' };
  }
  // hasWaveFromB é permitido (pode acenar de volta? Na verdade deveria aceitar)
  // Mas a UI mostraria "Responder aceno", então não chegaria aqui
  return { allowed: true };
}

/**
 * Verifica se uma ação de "aceitar aceno" é permitida.
 * Usado por acceptWave para validação.
 * 
 * @param facts - Fatos derivados
 * @returns { allowed: boolean, reason?: string }
 */
export function canAcceptWave(facts: InteractionFacts): { allowed: boolean; reason?: string } {
  if (facts.isBlockedByMe || facts.isBlockedByOther) {
    return { allowed: false, reason: 'Usuário bloqueado' };
  }
  if (facts.isMutedByA) {
    return { allowed: false, reason: 'Usuário silenciado' };
  }
  if (facts.hasActiveChat) {
    return { allowed: false, reason: 'Você já tem uma conversa ativa com esta pessoa' };
  }
  if (facts.hasCooldown) {
    return { allowed: false, reason: 'Não é possível interagir - período de espera ativo' };
  }
  if (!facts.hasWaveFromB) {
    return { allowed: false, reason: 'Não há aceno pendente para aceitar' };
  }
  return { allowed: true };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Retorna o nome legível do estado.
 */
export function getStateName(state: InteractionState): string {
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

/**
 * Verifica se o estado permite ação do usuário.
 */
export function isActionable(state: InteractionState): boolean {
  return state === InteractionState.NONE || 
         state === InteractionState.WAVE_RECEIVED ||
         state === InteractionState.CHAT_ACTIVE;
}
