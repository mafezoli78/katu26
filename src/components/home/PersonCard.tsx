import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useInteractionState, InteractionState } from '@/hooks/useInteractionState';
import { useAuth } from '@/contexts/AuthContext';
import { PersonNearby } from '@/hooks/usePeopleNearby';
import { NormalizedWave, NormalizedConversation, NormalizedMute, NormalizedBlock } from '@/hooks/useInteractionData';
import { HandshakeIcon } from '@/components/icons/HandshakeIcon';
import { SwipeActions } from '@/components/home/SwipeActions';
import { calculateAge } from '@/utils/date';

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
  const [photoOpen, setPhotoOpen] = useState(false);

  const { state, button, isVisible } = useInteractionState({
    otherUserId: person.id,
    placeId,
    sentWaves,
    receivedWaves,
    conversations,
    activeMutes,
    blocks,
  });

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

    if (!touch.directionLocked) {
      if (Math.abs(deltaX) < DIRECTION_THRESHOLD && Math.abs(deltaY) < DIRECTION_THRESHOLD) {
        return;
      }
      touch.directionLocked = Math.abs(deltaY) > Math.abs(deltaX) ? 'vertical' : 'horizontal';
    }

    if (touch.directionLocked === 'vertical') return;

    e.preventDefault();

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

    if (Math.abs(translateX) > BUTTON_WIDTH * SNAP_THRESHOLD) {
      setTranslateX(-BUTTON_WIDTH);
      onSwipeOpen(person.id);
    } else {
      setTranslateX(0);
      onSwipeOpen(null);
    }

    touchRef.current = null;
  }, [translateX, person.id, onSwipeOpen]);

  if (!isVisible) {
    return null;
  }

  const age = person.profile.data_nascimento
    ? calculateAge(person.profile.data_nascimento)
    : null;

  const initials = person.profile.nome?.[0]?.toUpperCase() || '?';

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

  const ctaButton = (
    <Button
      className={`w-full h-11 rounded-xl font-semibold ${getButtonStyles()}`}
      disabled={button.disabled}
      onClick={handleButtonClick}
    >
      <HandshakeIcon className={`h-5 w-5 mr-2 ${shouldAnimateIcon ? 'animate-wave' : ''}`} />
      {button.label}
    </Button>
  );

  return (
    <div className="relative overflow-hidden rounded-lg">
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
          <CardContent className="p-0">
            <div className="flex h-full">
              {/* FOTO */}
              <div
                className="w-[33%] min-h-[120px] relative overflow-hidden rounded-l-lg cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  if (person.profile.foto_url) setPhotoOpen(true);
                }}
              >
                {person.profile.foto_url ? (
                  <img
                    src={person.profile.foto_url}
                    alt={person.profile.nome || ''}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center font-bold text-xl bg-muted text-muted-foreground">
                    {initials}
                  </div>
                )}
              </div>

              {/* CONTEÚDO */}
              <div className="flex-1 flex flex-col justify-between p-4">
                <div>
                  <div className="font-semibold text-base">
                    {person.profile.nome}
                    {age !== null && <span className="text-muted-foreground font-normal">, {age}</span>}
                  </div>

                  {person.assuntoAtual ? (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      <span className="font-medium text-foreground">Aqui:</span> {person.assuntoAtual}
                    </p>
                  ) : person.profile.bio ? (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      <span className="font-medium text-foreground">Sobre mim:</span> {person.profile.bio}
                    </p>
                  ) : null}
                </div>

                <div className="mt-3">
                  {ctaButton}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Modal de ampliação da foto */}
      <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
        <DialogContent className="max-w-3xl">
          <DialogTitle className="sr-only">Foto ampliada</DialogTitle>
          {person.profile.foto_url && (
            <img
              src={person.profile.foto_url}
              alt={person.profile.nome || ''}
              className="w-full max-h-[70vh] object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
