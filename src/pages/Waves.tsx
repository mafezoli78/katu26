import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useWaves } from '@/hooks/useWaves';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Hand, Eye } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface WaveWithProfile {
  id: string;
  criado_em: string;
  visualizado: boolean;
  profile: {
    nome: string | null;
    foto_url: string | null;
  };
  location: {
    nome: string;
  };
}

export default function Waves() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { receivedWaves, sentWaves, markAsRead, markAllAsRead, unreadCount } = useWaves();
  const [receivedWithProfiles, setReceivedWithProfiles] = useState<WaveWithProfile[]>([]);
  const [sentWithProfiles, setSentWithProfiles] = useState<WaveWithProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (!receivedWaves.length && !sentWaves.length) {
        setLoading(false);
        return;
      }

      // Fetch received waves with sender profiles
      const receivedData: WaveWithProfile[] = [];
      for (const wave of receivedWaves) {
        const [profileRes, locationRes] = await Promise.all([
          supabase.from('profiles').select('nome, foto_url').eq('id', wave.de_user_id).single(),
          supabase.from('locations').select('nome').eq('id', wave.location_id).single()
        ]);
        
        if (profileRes.data && locationRes.data) {
          receivedData.push({
            id: wave.id,
            criado_em: wave.criado_em,
            visualizado: wave.visualizado,
            profile: profileRes.data,
            location: locationRes.data
          });
        }
      }
      setReceivedWithProfiles(receivedData);

      // Fetch sent waves with recipient profiles
      const sentData: WaveWithProfile[] = [];
      for (const wave of sentWaves) {
        const [profileRes, locationRes] = await Promise.all([
          supabase.from('profiles').select('nome, foto_url').eq('id', wave.para_user_id).single(),
          supabase.from('locations').select('nome').eq('id', wave.location_id).single()
        ]);
        
        if (profileRes.data && locationRes.data) {
          sentData.push({
            id: wave.id,
            criado_em: wave.criado_em,
            visualizado: wave.visualizado,
            profile: profileRes.data,
            location: locationRes.data
          });
        }
      }
      setSentWithProfiles(sentData);
      setLoading(false);
    };

    fetchProfiles();
  }, [receivedWaves, sentWaves]);

  const formatTime = (date: string) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: ptBR });
  };

  return (
    <MobileLayout>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold">Acenos</h1>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              <Eye className="h-4 w-4 mr-1" />
              Marcar como lidos
            </Button>
          )}
        </div>

        <Tabs defaultValue="received">
          <TabsList className="w-full">
            <TabsTrigger value="received" className="flex-1">
              Recebidos {unreadCount > 0 && `(${unreadCount})`}
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex-1">
              Enviados
            </TabsTrigger>
          </TabsList>

          <TabsContent value="received" className="mt-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : receivedWithProfiles.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Hand className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">Nenhum aceno recebido ainda</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {receivedWithProfiles.map((wave) => (
                  <Card 
                    key={wave.id} 
                    className={!wave.visualizado ? 'border-accent' : ''}
                    onClick={() => !wave.visualizado && markAsRead(wave.id)}
                  >
                    <CardContent className="p-4 flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={wave.profile.foto_url || undefined} />
                        <AvatarFallback className="bg-secondary">
                          {wave.profile.nome?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">Alguém acenou para você! 👋</p>
                        <p className="text-sm text-muted-foreground">
                          em {wave.location.nome} • {formatTime(wave.criado_em)}
                        </p>
                      </div>
                      {!wave.visualizado && (
                        <span className="h-2 w-2 rounded-full bg-accent" />
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="sent" className="mt-4">
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : sentWithProfiles.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center">
                  <Hand className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground">Você ainda não acenou para ninguém</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sentWithProfiles.map((wave) => (
                  <Card key={wave.id}>
                    <CardContent className="p-4 flex items-center gap-3">
                      <Avatar>
                        <AvatarImage src={wave.profile.foto_url || undefined} />
                        <AvatarFallback className="bg-secondary">
                          {wave.profile.nome?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="font-medium">Você acenou para {wave.profile.nome}</p>
                        <p className="text-sm text-muted-foreground">
                          em {wave.location.nome} • {formatTime(wave.criado_em)}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MobileLayout>
  );
}
