import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, Camera, RefreshCw, Loader2 } from 'lucide-react';

type Step = 'explain' | 'capture' | 'preview';

interface CheckinSelfieProps {
  onConfirm: (imageBlob: Blob) => void;
  onCancel: () => void;
  onSkip?: () => void; // TODO: REMOVE BEFORE PRODUCTION
  uploading?: boolean;
}

export function CheckinSelfie({ onConfirm, onCancel, onSkip, uploading }: CheckinSelfieProps) {
  const [step, setStep] = useState<Step>('explain');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('[Selfie] Camera error:', err);
      setCameraError('Não foi possível acessar a câmera. Verifique as permissões.');
    }
  }, []);

  const handleContinueToCamera = async () => {
    setStep('capture');
    // Small delay to ensure video element is rendered
    setTimeout(() => startCamera(), 100);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Crop to square from center, mirror horizontally for selfie
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;

    ctx.save();
    ctx.translate(size, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);
    ctx.restore();

    canvas.toBlob((blob) => {
      if (blob) {
        setCapturedBlob(blob);
        setCapturedImage(URL.createObjectURL(blob));
        stopCamera();
        setStep('preview');
      }
    }, 'image/jpeg', 0.85);
  };

  const handleRetake = async () => {
    setCapturedImage(null);
    setCapturedBlob(null);
    setStep('capture');
    setTimeout(() => startCamera(), 100);
  };

  const handleUsePhoto = () => {
    if (capturedBlob) {
      onConfirm(capturedBlob);
    }
  };

  const handleCancel = () => {
    stopCamera();
    onCancel();
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Explain step */}
      {step === 'explain' && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={handleCancel}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-xl font-bold">Confirme que você está aqui agora</h2>
          </div>

          <Card className="border-0 shadow-sm">
            <CardContent className="pt-6 space-y-5">
              <p className="text-base text-foreground leading-relaxed">
                Para entrar no local, precisamos de uma selfie feita neste momento.
              </p>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Ela será exibida no seu card enquanto você estiver presente.
                Ao sair do local, essa foto deixa de ser usada.
              </p>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  onClick={handleContinueToCamera}
                  className="w-full h-12 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base"
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Continuar
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleCancel}
                  className="w-full h-11 rounded-xl"
                >
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Camera capture step */}
      {step === 'capture' && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={handleCancel}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-xl font-bold">Tire sua selfie</h2>
          </div>

          <div className="relative w-full aspect-square rounded-2xl overflow-hidden bg-black">
            {cameraError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 gap-4">
                <p className="text-white text-center">{cameraError}</p>
                {/* TODO: REMOVE BEFORE PRODUCTION - Skip selfie for dev testing */}
                {onSkip && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-white border-white/30 hover:bg-white/10 text-xs opacity-60"
                    onClick={() => { stopCamera(); onSkip(); }}
                  >
                    Pular selfie (Modo Teste)
                  </Button>
                )}
              </div>
            ) : (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
                style={{ transform: 'scaleX(-1)' }}
              />
            )}
          </div>

          <canvas ref={canvasRef} className="hidden" />

          {!cameraError && (
            <Button
              onClick={handleCapture}
              className="w-full h-12 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base"
            >
              <Camera className="h-5 w-5 mr-2" />
              Capturar
            </Button>
          )}
        </>
      )}

      {/* Preview step */}
      {step === 'preview' && capturedImage && (
        <>
          <div className="flex items-center gap-3 mb-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-xl"
              onClick={handleRetake}
              disabled={uploading}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h2 className="text-xl font-bold">Ficou boa?</h2>
          </div>

          <div className="w-full aspect-square rounded-2xl overflow-hidden">
            <img
              src={capturedImage}
              alt="Selfie capturada"
              className="w-full h-full object-cover"
            />
          </div>

          <div className="flex flex-col gap-2">
            <Button
              onClick={handleUsePhoto}
              disabled={uploading}
              className="w-full h-12 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold text-base"
            >
              {uploading ? (
                <>
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Usar esta foto'
              )}
            </Button>
            <Button
              variant="ghost"
              onClick={handleRetake}
              disabled={uploading}
              className="w-full h-11 rounded-xl"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refazer
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
