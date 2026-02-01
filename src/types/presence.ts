/**
 * Tipos centralizados para o modelo de presença.
 * 
 * O modelo de três estados lógicos permite diferenciar:
 * - active: usuário está presente e pode interagir
 * - suspended: app em background OU aguardando revalidação (transitório)
 * - ended: presença definitivamente encerrada por INTENÇÃO HUMANA
 * 
 * REGRA DE OURO: 'ended' só ocorre com ação humana explícita.
 * Falhas técnicas, lifecycle, background → 'suspended' até confirmação.
 */

/**
 * Estado lógico da presença do usuário.
 * Determina as ações disponíveis e o comportamento do sistema.
 */
export type PresenceLogicalState = 'active' | 'suspended' | 'ended';

/**
 * Razões de encerramento DEFINITIVO (ação humana).
 * Apenas estas razões devem transicionar para 'ended'.
 */
export type HumanEndReasonType = 
  | 'manual'              // Usuário saiu explicitamente
  | 'expired'             // Timeout de presença atingido
  | 'gps_exit'            // Usuário saiu do raio GPS
  | 'presence_expired'    // Alias semântico para expiração
  | 'user_left_location'; // Alias semântico para saída manual

/**
 * Razões de SUSPENSÃO (técnicas/sistêmicas).
 * Não devem transicionar para 'ended' diretamente.
 */
export type TechnicalSuspendReasonType =
  | 'presence_lost_background'  // Presença perdida durante background
  | 'revalidation_pending'      // Aguardando confirmação do backend
  | 'lifecycle_interrupted';    // Interrupção de ciclo de vida

/**
 * União de todos os tipos de razão para compatibilidade.
 */
export type PresenceEndReasonType = HumanEndReasonType | TechnicalSuspendReasonType;

/**
 * Verifica se uma razão representa encerramento humano definitivo.
 */
export function isHumanEndReason(reason: PresenceEndReasonType): boolean {
  const humanReasons: PresenceEndReasonType[] = [
    'manual',
    'expired',
    'gps_exit',
    'presence_expired',
    'user_left_location',
  ];
  return humanReasons.includes(reason);
}

/**
 * Contexto completo de encerramento/suspensão de presença.
 */
export interface PresenceEndReason {
  type: PresenceEndReasonType;
  message: string;
  timestamp?: string;
  /** Indica se foi encerramento por ação humana (definitivo) */
  isHumanInitiated: boolean;
}

/**
 * Estado completo de presença exposto pelo hook.
 * Combina dados do backend com estado lógico derivado.
 */
export interface PresenceState {
  /** Estado lógico atual (derivado de currentPresence + visibilidade + razão) */
  logicalState: PresenceLogicalState;
  /** Razão do último encerramento/suspensão */
  endReason: PresenceEndReason | null;
  /** Indica se está em processo de revalidação */
  isRevalidating: boolean;
  /** Timestamp da última revalidação bem-sucedida */
  lastValidatedAt: string | null;
}

/**
 * Mapeia razões internas para razões semânticas de domínio.
 */
export function mapToSemanticReason(internalReason: 'manual' | 'expired' | 'gps_exit'): HumanEndReasonType {
  const mapping: Record<'manual' | 'expired' | 'gps_exit', HumanEndReasonType> = {
    manual: 'user_left_location',
    expired: 'presence_expired',
    gps_exit: 'gps_exit',
  };
  return mapping[internalReason];
}

/**
 * Mensagens de feedback para cada tipo de encerramento/suspensão.
 */
export const END_REASON_MESSAGES: Record<PresenceEndReasonType, string> = {
  // Razões humanas (definitivas)
  manual: 'Você saiu do local',
  expired: 'Sua presença expirou',
  gps_exit: 'Você saiu da área do local',
  presence_expired: 'Sua presença expirou',
  user_left_location: 'Você saiu do local',
  // Razões técnicas (suspensão - não exibir como encerramento)
  presence_lost_background: 'Reconectando...',
  revalidation_pending: 'Verificando presença...',
  lifecycle_interrupted: 'Reconectando...',
};
