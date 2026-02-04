import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInteractionState, InteractionState } from '@/hooks/useInteractionState';
import { PersonNearby } from '@/hooks/usePeopleNearby';
import { NormalizedWave, NormalizedConversation, NormalizedMute, NormalizedBlock } from '@/hooks/useInteractionData';

/**
 * Ícone de mão acenando
 */
function WavingHand({ className }: { className?: string }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={className}
    >
      <path d="M7 11.5V14c0 2.5 2 4.5 5 6c3-1.5 5-3.5 5-6v-2.5" />
      <path d="M11.5 6.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v4.5" />
      <path d="M14.5 7.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v3" />
      <path d="M17.5 9.5c0-1-0.5-2-1.5-2s-1.5 1-1.5 2v2" />
      <path d="M8.5 11V6c0-1-0.5-2-1.5-2S5.5 5 5.5 6v8c0 0.5 0 1.5 0.5 2.5" />
    </svg>
  );
}

interface PersonCardProps {
  person: PersonNearby;
  placeId: string;
  sentWaves: NormalizedWave[];
  receivedWaves: NormalizedWave[];
  conversations: NormalizedConversation[];
  activeMutes: NormalizedMute[];
  blocks: NormalizedBlock[];
  onWave: (toUserId: string) => void;
}

/**
 * Card de pessoa na lista da Home.
 * 
 * Usa useInteractionState como ÚNICA fonte de verdade para:
 * - Visibilidade do card
 * - Label, estado e ação do botão principal
 */
export function PersonCard({
  person,
  placeId,
  sentWaves,
  receivedWaves,
  conversations,
  activeMutes,
  blocks,
  onWave,
}: PersonCardProps) {
  const navigate = useNavigate();
  
  // Hook de estado - ÚNICA fonte de verdade
  const { state, stateName, button, isVisible } = useInteractionState({
    otherUserId: person.id,
    placeId,
    sentWaves,
    receivedWaves,
    conversations,
    activeMutes,
    blocks,
  });

  // Card visibility: controlled EXCLUSIVELY by useInteractionState
  // Only BLOCKED state returns isVisible=false - all other states keep card visible

  // Se não deve ser visível (BLOCKED), não renderiza
  if (!isVisible) {
    return null;
  }

  // Calcular idade
  const age = person.profile.data_nascimento 
    ? new Date().getFullYear() - new Date(person.profile.data_nascimento).getFullYear()
    : null;

  // Handler do botão principal
  const handleButtonClick = () => {
    switch (button.action) {
      case 'wave':
        onWave(person.id);
        break;
      case 'open_waves':
        navigate('/waves');
        break;
      case 'open_chat':
        if (button.conversationId) {
          navigate(`/chat?conversationId=${button.conversationId}`);
        }
        break;
      case 'none':
      default:
        // Não faz nada
        break;
    }
  };

  // Determinar estilos do botão baseado no estado
  const getButtonStyles = () => {
    switch (state) {
      case InteractionState.NONE:
        return 'bg-accent text-accent-foreground hover:bg-accent/90';
      case InteractionState.WAVE_RECEIVED:
        return 'bg-katu-green text-white hover:bg-katu-green/90';
      case InteractionState.CHAT_ACTIVE:
        return 'bg-primary text-primary-foreground hover:bg-primary/90';
      case InteractionState.WAVE_SENT:
      case InteractionState.ENDED_BY_ME:
      case InteractionState.ENDED_BY_OTHER:
      case InteractionState.MUTED:
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  // Determinar se deve animar o ícone
  const shouldAnimateIcon = state === InteractionState.NONE || state === InteractionState.WAVE_RECEIVED;

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      <CardContent className="p-4">
        <div className="flex gap-3">
          <Avatar className="h-14 w-14 ring-2 ring-background shadow">
            <AvatarImage src={person.profile.foto_url || undefined} />
            <AvatarFallback className="bg-katu-blue text-white text-lg font-semibold">
              {person.profile.nome?.[0]?.toUpperCase() || '?'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold truncate">
                {person.profile.nome}
                {age && <span className="text-muted-foreground font-normal">, {age}</span>}
              </h3>
            </div>
            {/* Exibir assunto_atual OU bio, nunca ambos */}
            {person.assuntoAtual ? (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                <span className="font-medium text-foreground">Aqui:</span> {person.assuntoAtual}
              </p>
            ) : person.profile.bio ? (
              <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2">
                <span className="font-medium text-foreground">Sobre mim:</span> {person.profile.bio}
              </p>
            ) : null}
          </div>
        </div>

        {/* Botão principal - controlado EXCLUSIVAMENTE pelo hook */}
        <Button
          className={`w-full mt-4 h-11 rounded-xl font-semibold ${getButtonStyles()}`}
          disabled={button.disabled}
          onClick={handleButtonClick}
        >
          <WavingHand className={`h-5 w-5 mr-2 ${shouldAnimateIcon ? 'animate-wave' : ''}`} />
          {button.label}
        </Button>
      </CardContent>
    </Card>
  );
}
