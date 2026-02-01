/**
 * Tipos centralizados para o modelo de presença.
 * 
 * O modelo de três estados lógicos permite diferenciar:
 * - active: usuário está presente e pode interagir
 * - suspended: app em background (transitório - pode cair para ended)
 * - ended: presença definitivamente encerrada
 * 
 * No MVP, suspended → ended é imediato (0s de tolerância).
 * O valor está no contrato semântico, não no tempo.
 */

/**
 * Estado lógico da presença do usuário.
 * Determina as ações disponíveis e o comportamento do sistema.
 */
export type PresenceLogicalState = 'active' | 'suspended' | 'ended';

/**
 * Razões granulares para encerramento de presença.
 * Cada razão tem semântica distinta para feedback ao usuário.
 */
export type PresenceEndReasonType = 
  | 'manual'              // Usuário saiu explicitamente
  | 'expired'             // Timeout de presença atingido
  | 'gps_exit'            // Usuário saiu do raio GPS
  | 'presence_expired'    // Alias semântico para expiração
  | 'presence_lost_background' // Presença perdida durante background
  | 'user_left_location'; // Alias semântico para saída manual

/**
 * Contexto completo de encerramento de presença.
 */
export interface PresenceEndReason {
  type: PresenceEndReasonType;
  message: string;
  timestamp?: string;
}

/**
 * Estado completo de presença exposto pelo hook.
 * Combina dados do backend com estado lógico derivado.
 */
export interface PresenceState {
  /** Estado lógico atual (derivado de currentPresence + visibilidade) */
  logicalState: PresenceLogicalState;
  /** Razão do último encerramento (se ended) */
  endReason: PresenceEndReason | null;
  /** Indica se está em processo de revalidação */
  isRevalidating: boolean;
  /** Timestamp da última revalidação bem-sucedida */
  lastValidatedAt: string | null;
}

/**
 * Mapeia razões internas para razões semânticas de domínio.
 */
export function mapToSemanticReason(internalReason: 'manual' | 'expired' | 'gps_exit'): PresenceEndReasonType {
  const mapping: Record<'manual' | 'expired' | 'gps_exit', PresenceEndReasonType> = {
    manual: 'user_left_location',
    expired: 'presence_expired',
    gps_exit: 'gps_exit',
  };
  return mapping[internalReason];
}

/**
 * Mensagens de feedback para cada tipo de encerramento.
 */
export const END_REASON_MESSAGES: Record<PresenceEndReasonType, string> = {
  manual: 'Você saiu do local',
  expired: 'Sua presença expirou',
  gps_exit: 'Você saiu da área do local',
  presence_expired: 'Sua presença expirou',
  presence_lost_background: 'Presença encerrada enquanto o app estava em segundo plano',
  user_left_location: 'Você saiu do local',
};
