import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useInteractionState, InteractionState } from '@/hooks/useInteractionState';
import { useAuth } from '@/contexts/AuthContext';
import { PersonNearby } from '@/hooks/usePeopleNearby';
import { NormalizedWave, NormalizedConversation, NormalizedMute, NormalizedBlock } from '@/hooks/useInteractionData';
import { HandshakeIcon } from '@/components/icons/HandshakeIcon';
import { SwipeActions } from '@/components/home/SwipeActions';

const BUTTON_WIDTH = 140;
const DIRECTION_THRESHOLD = 15;
const SNAP_THRESHOLD = 0.4;

interface PersonCardProps {
  person: PersonNearby;
  placeId: string;
  sentWaves: NormalizedWave[];
  receivedWaves: NormalizedWave[];
  conversations: NormalizedConversation[];
  activeMutes: NormalizedMute[];
  blocks: NormalizedBlock[];
  onWave: (toUserId: string) => void;
  onMute: (userId: string) => Promise<void>;
  onBlock: (userId: string) => Promise<void>;
  openCardId: string | null;
  onSwipeOpen: (id: string | null) => void;
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
  onMute,
  onBlock,
  openCardId,
  onSwipeOpen,
}: PersonCardProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  
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

  // Derive mute/block states for swipe buttons
  const isMutedByMe = activeMutes.some(
    m => m.user_id === user?.id && m.muted_user_id === person.id
  );
  const isBlockedByMe = blocks.some(
    b => b.user_id === user?.id && b.blocked_user_id === person.id
  );

  // Swipe state
  const [translateX, setTranslateX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const touchRef = useRef<{
    startX: number;
    startY: number;
    directionLocked: 'horizontal' | 'vertical' | null;
    startTranslateX: number;
  } | null>(null);

  // Close card when another card opens
  useEffect(() => {
    if (openCardId !== person.id && translateX !== 0) {
      setIsAnimating(true);
      setTranslateX(0);
    }
  }, [openCardId, person.id, translateX]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setIsAnimating(false);
    touchRef.current = {
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
      directionLocked: null,
      startTranslateX: translateX,
    };
  }, [translateX]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = touchRef.current;
    if (!touch) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const deltaX = currentX - touch.startX;
    const deltaY = currentY - touch.startY;

    // Direction detection
    if (!touch.directionLocked) {
      if (Math.abs(deltaX) < DIRECTION_THRESHOLD && Math.abs(deltaY) < DIRECTION_THRESHOLD) {
        return; // Not enough movement to decide
      }
      touch.directionLocked = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
    }

    if (touch.directionLocked === 'vertical') return;

    // Horizontal swipe - prevent scroll
    e.preventDefault();

    // Notify parent that this card is being swiped
    if (openCardId !== person.id) {
      onSwipeOpen(person.id);
    }

    const newTranslateX = Math.max(-BUTTON_WIDTH, Math.min(0, touch.startTranslateX + deltaX));
    setTranslateX(newTranslateX);
  }, [openCardId, person.id, onSwipeOpen]);

  const handleTouchEnd = useCallback(() => {
    const touch = touchRef.current;
    if (!touch || touch.directionLocked !== 'horizontal') {
      touchRef.current = null;
      return;
    }

    setIsAnimating(true);

    // Snap logic
    if (Math.abs(translateX) > BUTTON_WIDTH * SNAP_THRESHOLD) {
      setTranslateX(-BUTTON_WIDTH);
      onSwipeOpen(person.id);
    } else {
      setTranslateX(0);
      onSwipeOpen(null);
    }

    touchRef.current = null;
  }, [translateX, person.id, onSwipeOpen]);

  // Card visibility: controlled EXCLUSIVELY by useInteractionState
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

  const shouldAnimateIcon = state === InteractionState.NONE || state === InteractionState.WAVE_RECEIVED;

  return (
    <div className="relative overflow-hidden rounded-lg">
      {/* Action buttons behind the card */}
      <SwipeActions
        personId={person.id}
        isMuted={isMutedByMe}
        isBlocked={isBlockedByMe}
        onMute={async () => {
          await onMute(person.id);
          setIsAnimating(true);
          setTranslateX(0);
          onSwipeOpen(null);
        }}
        onBlock={async () => {
          await onBlock(person.id);
          setIsAnimating(true);
          setTranslateX(0);
          onSwipeOpen(null);
        }}
      />

      {/* Sliding card */}
      <div
        style={{
          transform: `translateX(${translateX}px)`,
          transition: isAnimating ? 'transform 200ms ease-out' : 'none',
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
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

            <Button
              className={`w-full mt-4 h-11 rounded-xl font-semibold ${getButtonStyles()}`}
              disabled={button.disabled}
              onClick={handleButtonClick}
            >
              <HandshakeIcon className={`h-5 w-5 mr-2 ${shouldAnimateIcon ? 'animate-wave' : ''}`} />
              {button.label}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
