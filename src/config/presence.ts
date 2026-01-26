/**
 * Configurações unificadas do sistema de presença.
 * "O agora é presente" - todas as regras convergem para o momento atual.
 */

// Raio único de presença (em metros)
// Usado para: buscar locais, validar posição, encerrar presença
// 150m é o equilíbrio entre precisão GPS urbana e área de um estabelecimento
export const PRESENCE_RADIUS_METERS = 150;

// Raio de busca de locais (em metros)
// Maior que o raio de presença para mostrar opções próximas
export const SEARCH_RADIUS_METERS = 500;

// Tempo padrão de duração da presença (em milissegundos)
// 1 hora = 60 * 60 * 1000 = 3.600.000ms
export const PRESENCE_DURATION_MS = 60 * 60 * 1000;

// Intervalo de verificação de GPS (em milissegundos)
// Verifica a cada 30 segundos se o usuário ainda está no raio
export const GPS_CHECK_INTERVAL_MS = 30 * 1000;

// Tolerância de precisão do GPS (em metros)
// Ignora leituras com precisão pior que este valor
export const GPS_ACCURACY_THRESHOLD_METERS = 50;

// Número de leituras consecutivas fora do raio para encerrar presença
// Evita encerramento por flutuação momentânea de GPS
export const GPS_EXIT_THRESHOLD_COUNT = 2;

/**
 * Calcula a distância entre duas coordenadas usando a fórmula de Haversine.
 * @returns Distância em metros
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Raio da Terra em metros
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Verifica se uma posição está dentro do raio de um local.
 */
export function isWithinRadius(
  userLat: number,
  userLon: number,
  locationLat: number,
  locationLon: number,
  radiusMeters: number = PRESENCE_RADIUS_METERS
): boolean {
  const distance = calculateDistanceMeters(userLat, userLon, locationLat, locationLon);
  return distance <= radiusMeters;
}

/**
 * Formata o tempo restante em formato legível (mm:ss).
 */
export function formatRemainingTime(ms: number): string {
  if (ms <= 0) return '0:00';
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
