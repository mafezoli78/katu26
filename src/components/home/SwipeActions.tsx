import { VolumeX, Ban } from 'lucide-react';

const BUTTON_WIDTH = 140;

interface SwipeActionsProps {
  personId: string;
  isMuted: boolean;
  isBlocked: boolean;
  onMute: () => Promise<void>;
  onBlock: () => Promise<void>;
}

export function SwipeActions({ personId, isMuted, isBlocked, onMute, onBlock }: SwipeActionsProps) {
  const muteDisabledByBlock = isBlocked;

  return (
    <div className={`absolute right-0 top-0 bottom-0 flex flex-col w-[${BUTTON_WIDTH}px]`} style={{ width: BUTTON_WIDTH }}>
      <button
        className={`flex-1 flex flex-col items-center justify-center gap-1 ${
          muteDisabledByBlock ? 'opacity-30' : 'active:bg-muted/50'
        }`}
        onClick={muteDisabledByBlock ? undefined : onMute}
      >
        <VolumeX
          className={`h-5 w-5 ${isMuted ? 'text-foreground fill-foreground' : 'text-foreground/70'}`}
        />
        <span className={`text-xs font-semibold ${isMuted ? 'text-foreground' : 'text-foreground/70'}`}>
          {isMuted ? 'Silenciado' : 'Silenciar'}
        </span>
      </button>
      <button
        className="flex-1 flex flex-col items-center justify-center gap-1 active:bg-muted/50"
        onClick={onBlock}
      >
        <Ban
          className={`h-5 w-5 ${isBlocked ? 'text-foreground fill-foreground' : 'text-foreground/70'}`}
        />
        <span className={`text-xs font-semibold ${isBlocked ? 'text-foreground' : 'text-foreground/70'}`}>
          {isBlocked ? 'Bloqueado' : 'Bloquear'}
        </span>
      </button>
    </div>
  );
}
