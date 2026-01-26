import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useWaves, Wave } from '@/hooks/useWaves';
import { useConversations } from '@/hooks/useConversations';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { Hand, Eye, Check, X, MessageCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from '@/hooks/use-toast';

interface WaveWithProfile {
  id: string;
  criado_em: string;
  visualizado: boolean;
  expires_at: string | null;
  status: 'pending' | 'accepted';
  de_user_id: string;
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
  const { 
    receivedWaves, 
    sentWaves, 
    markAsRead, 
    markAllAsRead, 
    unreadCount,
    acceptWave,
    ignoreWave 
  } = useWaves();
  const { addConversation } = useConversations();
  const [receivedWithProfiles, setReceivedWithProfiles] = useState<WaveWithProfile[]>([]);
  const [sentWithProfiles, setSentWithProfiles] = useState<WaveWithProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingWaveId, setProcessingWaveId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const fetchProfiles = async () => {
      if (!receivedWaves.length && !sentWaves.length) {
        setReceivedWithProfiles([]);
        setSentWithProfiles([]);
        setLoading(false);
        return;
      }

      // Fetch received waves with sender profiles
      const receivedData: WaveWithProfile[] = [];
      for (const wave of receivedWaves) {
        const [profileRes, locationRes] = await Promise.all([
          supabase.from('profiles').select('nome, foto_url').eq('id', wave.de_user_id).single(),
          supabase.from('locations').select('nome').eq('id', wave.location_id).maybeSingle()
        ]);
        
        // Try places table if not found in locations
        let locationName = locationRes.data?.nome;
        if (!locationName) {
          const placeRes = await supabase.from('places').select('nome').eq('id', wave.location_id).maybeSingle();
          locationName = placeRes.data?.nome || 'Local desconhecido';
        }
        
        if (profileRes.data) {
          receivedData.push({
            id: wave.id,
            criado_em: wave.criado_em,
            visualizado: wave.visualizado,
            expires_at: wave.expires_at,
            status: wave.status,
            de_user_id: wave.de_user_id,
            profile: profileRes.data,
            location: { nome: locationName }
          });
        }
      }
      setReceivedWithProfiles(receivedData);

      // Fetch sent waves with recipient profiles
      const sentData: WaveWithProfile[] = [];
      for (const wave of sentWaves) {
        const [profileRes, locationRes] = await Promise.all([
          supabase.from('profiles').select('nome, foto_url').eq('id', wave.para_user_id).single(),
          supabase.from('locations').select('nome').eq('id', wave.location_id).maybeSingle()
        ]);
        
        let locationName = locationRes.data?.nome;
        if (!locationName) {
          const placeRes = await supabase.from('places').select('nome').eq('id', wave.location_id).maybeSingle();
          locationName = placeRes.data?.nome || 'Local desconhecido';
        }
        
        if (profileRes.data) {
          sentData.push({
            id: wave.id,
            criado_em: wave.criado_em,
            visualizado: wave.visualizado,
            expires_at: wave.expires_at,
            status: wave.status,
            de_user_id: wave.de_user_id,
            profile: profileRes.data,
            location: { nome: locationName }
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

  const formatExpiration = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const expires = new Date(expiresAt);
    const now = new Date();
    if (expires <= now) return 'Expirado';
    return `Expira ${formatDistanceToNow(expires, { addSuffix: true, locale: ptBR })}`;
  };

  const handleAcceptWave = async (wave: WaveWithProfile) => {
    setProcessingWaveId(wave.id);
    
    const { error, conversation } = await acceptWave(wave.id);
    
    if (error) {
      toast({
        title: 'Erro ao aceitar aceno',
        description: error.message,
        variant: 'destructive'
      });
    } else if (conversation) {
      // Remove from local list immediately
      setReceivedWithProfiles(prev => prev.filter(w => w.id !== wave.id));
      
      addConversation(conversation);
      
      toast({
        title: 'Conexão criada! 🎉',
        description: `Você agora pode conversar com ${wave.profile.nome || 'esta pessoa'}`
      });
    }
    
    setProcessingWaveId(null);
  };

  const handleIgnoreWave = async (waveId: string) => {
    await ignoreWave(waveId);
    setReceivedWithProfiles(prev => prev.filter(w => w.id !== waveId));
    
    toast({
      title: 'Aceno ignorado',
      description: 'Você pode receber outros acenos desta pessoa'
    });
  };

  return (
    <MobileLayout>
      <div className="p-4 page-fade">
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
                  <p className="text-sm text-muted-foreground mt-1">
                    Quando alguém acenar para você, aparecerá aqui
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {receivedWithProfiles.map((wave) => {
                  const expiration = formatExpiration(wave.expires_at);
                  const isProcessing = processingWaveId === wave.id;
                  
                  return (
                    <Card 
                      key={wave.id} 
                      className={!wave.visualizado ? 'border-accent' : ''}
                      onClick={() => !wave.visualizado && markAsRead(wave.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-3">
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
                            {expiration && (
                              <p className="text-xs text-muted-foreground">
                                {expiration}
                              </p>
                            )}
                          </div>
                          {!wave.visualizado && (
                            <span className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex gap-2 mt-2">
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleIgnoreWave(wave.id);
                            }}
                            disabled={isProcessing}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Ignorar
                          </Button>
                          <Button 
                            size="sm" 
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleAcceptWave(wave);
                            }}
                            disabled={isProcessing}
                          >
                            {isProcessing ? (
                              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4 mr-1" />
                            )}
                            Aceitar
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
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
                  <p className="text-sm text-muted-foreground mt-1">
                    Acene para pessoas próximas para iniciar uma conexão
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {sentWithProfiles.map((wave) => {
                  const expiration = formatExpiration(wave.expires_at);
                  
                  return (
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
                          {expiration && (
                            <p className="text-xs text-muted-foreground">
                              {expiration}
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground px-2 py-1 bg-secondary rounded">
                          Aguardando
                        </span>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </MobileLayout>
  );
}
