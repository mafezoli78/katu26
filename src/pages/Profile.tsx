import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Camera, LogOut, Check, User, Heart, Pencil, X } from 'lucide-react';

const AVAILABLE_INTERESTS = [
  'Música', 'Cinema', 'Esportes', 'Tecnologia', 'Viagens', 'Gastronomia',
  'Arte', 'Fotografia', 'Leitura', 'Games', 'Natureza', 'Yoga',
  'Dança', 'Teatro', 'Empreendedorismo', 'Fitness', 'Pets', 'Café'
];

export default function Profile() {
  const { user, signOut } = useAuth();
  const { profile, interests, updateProfile, updateInterests, uploadAvatar, calculateAge } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState('');
  const [bio, setBio] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (profile) {
      setNome(profile.nome || '');
      setBio(profile.bio || '');
    }
    setSelectedInterests(interests.map(i => i.tag));
  }, [profile, interests]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const { error } = await uploadAvatar(file);
      if (error) {
        toast({ variant: 'destructive', title: 'Erro ao atualizar foto' });
      } else {
        toast({ title: 'Foto atualizada!' });
      }
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const handleSave = async () => {
    if (selectedInterests.length < 3) {
      toast({ variant: 'destructive', title: 'Selecione pelo menos 3 interesses' });
      return;
    }

    setLoading(true);
    try {
      await updateProfile({ nome: nome.trim(), bio: bio.trim() || null });
      await updateInterests(selectedInterests);
      toast({ title: 'Perfil atualizado!' });
      setEditing(false);
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao salvar' });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut();
    navigate('/auth', { replace: true });
  };

  const age = profile?.data_nascimento ? calculateAge(profile.data_nascimento) : null;

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 page-fade">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <User className="h-5 w-5 text-katu-blue" />
            <h1 className="text-xl font-bold">Meu Perfil</h1>
          </div>
          {!editing && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setEditing(true)}
              className="h-9 rounded-lg"
            >
              <Pencil className="h-4 w-4 mr-1.5" />
              Editar
            </Button>
          )}
        </div>

        {/* Profile Card */}
        <Card className="border-0 shadow-sm overflow-hidden">
          <div className="h-20 katu-gradient" />
          <CardContent className="relative pt-0 pb-6">
            {/* Avatar */}
            <div className="flex justify-center -mt-12 mb-4">
              <div className="relative">
                <Avatar className="h-24 w-24 ring-4 ring-card shadow-lg">
                  <AvatarImage src={profile?.foto_url || undefined} />
                  <AvatarFallback className="bg-katu-blue text-white text-2xl font-bold">
                    {profile?.nome?.[0]?.toUpperCase() || '?'}
                  </AvatarFallback>
                </Avatar>
                <label className="absolute bottom-0 right-0 bg-accent text-accent-foreground rounded-full p-2 cursor-pointer hover:bg-accent/90 shadow-lg transition-transform hover:scale-105">
                  <Camera className="h-4 w-4" />
                  <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
                </label>
              </div>
            </div>

            {editing ? (
              <div className="space-y-4">
                <div>
                  <Label className="text-sm font-medium">Nome</Label>
                  <Input 
                    value={nome} 
                    onChange={(e) => setNome(e.target.value)} 
                    maxLength={50} 
                    className="mt-1.5 h-11 rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium">Bio</Label>
                  <Textarea 
                    value={bio} 
                    onChange={(e) => setBio(e.target.value)} 
                    maxLength={150} 
                    rows={3}
                    className="mt-1.5 rounded-xl resize-none"
                    placeholder="Conte um pouco sobre você..."
                  />
                  <p className="text-xs text-muted-foreground text-right mt-1">{bio.length}/150</p>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <h2 className="text-xl font-bold">
                  {profile?.nome}
                  {age && <span className="text-muted-foreground font-normal">, {age}</span>}
                </h2>
                {profile?.bio && (
                  <p className="text-muted-foreground mt-2 text-sm">{profile.bio}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Interests Card */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Heart className="h-4 w-4 text-accent" />
              Interesses
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {editing ? (
                AVAILABLE_INTERESTS.map((interest) => {
                  const isSelected = selectedInterests.includes(interest);
                  return (
                    <Badge
                      key={interest}
                      variant={isSelected ? 'default' : 'outline'}
                      className={`cursor-pointer py-1.5 px-3 rounded-lg transition-all ${
                        isSelected 
                          ? 'bg-katu-green text-white hover:bg-katu-green/90' 
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                      {isSelected && <Check className="ml-1.5 h-3 w-3" />}
                    </Badge>
                  );
                })
              ) : (
                interests.length > 0 ? (
                  interests.map((i) => (
                    <Badge 
                      key={i.id} 
                      variant="secondary"
                      className="py-1.5 px-3 rounded-lg bg-katu-green/10 text-katu-green"
                    >
                      {i.tag}
                    </Badge>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum interesse selecionado</p>
                )
              )}
            </div>
            {editing && (
              <p className="text-xs text-muted-foreground mt-3">
                Selecione pelo menos 3 interesses
              </p>
            )}
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          {editing ? (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => setEditing(false)} 
                className="flex-1 h-11 rounded-xl"
              >
                <X className="h-4 w-4 mr-1.5" />
                Cancelar
              </Button>
              <Button 
                onClick={handleSave} 
                disabled={loading} 
                className="flex-1 h-11 rounded-xl bg-accent text-accent-foreground hover:bg-accent/90 font-semibold"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          ) : (
            <Button 
              variant="outline" 
              onClick={handleLogout} 
              className="w-full h-11 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sair da conta
            </Button>
          )}
        </div>
      </div>
    </MobileLayout>
  );
}
