import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, RefreshCw, Loader2 } from 'lucide-react';
import * as cameraService from '@/services/cameraService';

type Step = 'capture' | 'preview';

interface CheckinSelfieProps {
  onConfirm: (imageBlob: Blob) => void;
  onCancel: () => void;
  onSkip?: () => void; // TODO: REMOVE BEFORE PRODUCTION
  uploading?: boolean;
}

export function CheckinSelfie({ onConfirm, onCancel, onSkip, uploading }: CheckinSelfieProps) {
  const [step, setStep] = useState<Step>('capture');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Attach stream to video element when on capture step
  useEffect(() => {
    if (step !== 'capture') return;

    const stream = cameraService.getStream();
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
      setCameraError(null);
    } else {
      setCameraError('Não foi possível acessar a câmera. Verifique as permissões.');
    }
  }, [step]);

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
        setStep('preview');
      }
    }, 'image/jpeg', 0.85);
  };

  const handleRetake = async () => {
    setCapturedImage(null);
    setCapturedBlob(null);
    setCameraError(null);
    try {
      await cameraService.requestCamera();
    } catch (err) {
      console.error('[Selfie] Camera retry failed:', err);
      setCameraError('Não foi possível acessar a câmera. Verifique as permissões.');
    }
    setStep('capture');
  };

  const handleUsePhoto = () => {
    if (capturedBlob) {
      onConfirm(capturedBlob);
    }
  };

  const handleCancel = () => {
    cameraService.stopCamera();
    onCancel();
  };

  return (
    <div className="space-y-4 animate-fade-in">
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
                    onClick={() => { cameraService.stopCamera(); onSkip(); }}
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
