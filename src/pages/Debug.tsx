import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, AlertTriangle, Camera, MapPin } from 'lucide-react';

interface DiagItem {
  label: string;
  value: string;
  ok?: boolean;
}

export default function Debug() {
  const [items, setItems] = useState<DiagItem[]>([]);
  const [cameraResult, setCameraResult] = useState<{ status: string; error?: string } | null>(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [geoResult, setGeoResult] = useState<{ status: string; error?: string } | null>(null);
  const [geoLoading, setGeoLoading] = useState(false);

  useEffect(() => {
    const collect = async () => {
      const diag: DiagItem[] = [];

      const secure = window.isSecureContext;
      diag.push({ label: 'isSecureContext', value: String(secure), ok: secure });

      const hasMedia = navigator.mediaDevices !== undefined;
      diag.push({ label: 'navigator.mediaDevices', value: hasMedia ? 'disponível' : 'indisponível', ok: hasMedia });

      // Camera permission
      try {
        const cam = await navigator.permissions.query({ name: 'camera' as PermissionName });
        diag.push({ label: 'Permissão câmera', value: cam.state, ok: cam.state === 'granted' });
      } catch {
        diag.push({ label: 'Permissão câmera', value: 'não suportado', ok: false });
      }

      // Geolocation permission
      try {
        const geo = await navigator.permissions.query({ name: 'geolocation' });
        diag.push({ label: 'Permissão geolocalização', value: geo.state, ok: geo.state === 'granted' });
      } catch {
        diag.push({ label: 'Permissão geolocalização', value: 'não suportado', ok: false });
      }

      const hasGeo = navigator.geolocation !== undefined;
      diag.push({ label: 'navigator.geolocation', value: hasGeo ? 'disponível' : 'indisponível', ok: hasGeo });

      diag.push({ label: 'devicePixelRatio', value: String(window.devicePixelRatio) });
      diag.push({ label: 'userAgent', value: navigator.userAgent });
      diag.push({ label: 'platform', value: navigator.platform });
      diag.push({ label: 'screen', value: `${screen.width} × ${screen.height}` });

      const isPWA = window.matchMedia('(display-mode: standalone)').matches;
      diag.push({ label: 'PWA (standalone)', value: isPWA ? 'Sim' : 'Não', ok: isPWA });

      setItems(diag);
    };
    collect();
  }, []);

  const testCamera = async () => {
    setCameraLoading(true);
    setCameraResult(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach(t => t.stop());
      setCameraResult({ status: 'OK ✓' });
    } catch (err: any) {
      setCameraResult({ status: 'Erro', error: `${err.name}: ${err.message}` });
    } finally {
      setCameraLoading(false);
    }
  };

  const testGeo = () => {
    setGeoLoading(true);
    setGeoResult(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoResult({ status: `OK ✓ (${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}, ±${pos.coords.accuracy.toFixed(0)}m)` });
        setGeoLoading(false);
      },
      (err) => {
        setGeoResult({ status: 'Erro', error: `code ${err.code}: ${err.message}` });
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const StatusIcon = ({ ok }: { ok?: boolean }) => {
    if (ok === undefined) return null;
    return ok ? <CheckCircle className="h-4 w-4 text-green-500 shrink-0" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0" />;
  };

  return (
    <div className="min-h-screen bg-background p-4 max-w-lg mx-auto space-y-4">
      <h1 className="text-xl font-bold text-foreground">Diagnóstico</h1>
      <p className="text-xs text-muted-foreground">Tela de teste — não visível para usuários</p>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Ambiente</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-sm">
              <StatusIcon ok={item.ok} />
              <span className="font-medium text-foreground shrink-0">{item.label}:</span>
              <span className="text-muted-foreground break-all">{item.value}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Testes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Button onClick={testCamera} disabled={cameraLoading} variant="outline" className="w-full">
              <Camera className="h-4 w-4 mr-2" />
              {cameraLoading ? 'Testando...' : 'Testar Câmera'}
            </Button>
            {cameraResult && (
              <div className={`text-xs p-2 rounded ${cameraResult.error ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-700'}`}>
                {cameraResult.status}{cameraResult.error && ` — ${cameraResult.error}`}
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Button onClick={testGeo} disabled={geoLoading} variant="outline" className="w-full">
              <MapPin className="h-4 w-4 mr-2" />
              {geoLoading ? 'Testando...' : 'Testar Localização'}
            </Button>
            {geoResult && (
              <div className={`text-xs p-2 rounded ${geoResult.error ? 'bg-destructive/10 text-destructive' : 'bg-green-500/10 text-green-700'}`}>
                {geoResult.status}{geoResult.error && ` — ${geoResult.error}`}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
