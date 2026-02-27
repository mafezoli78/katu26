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
import { ImageCropper } from '@/components/profile/ImageCropper';
import { EmailChangeDialog } from '@/components/profile/EmailChangeDialog';
import { PasswordChangeDialog } from '@/components/profile/PasswordChangeDialog';
import { 
  Camera, LogOut, Check, User, Heart, Pencil, X, 
  Calendar, Mail, Lock, AlertCircle, Database 
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const AVAILABLE_INTERESTS = [
  'Música', 'Cinema', 'Esportes', 'Tecnologia', 'Viagens', 'Gastronomia',
  'Arte', 'Fotografia', 'Leitura', 'Games', 'Natureza', 'Yoga',
  'Dança', 'Teatro', 'Empreendedorismo', 'Fitness', 'Pets', 'Café'
];

const MIN_BIO_LENGTH = 40;
const MAX_BIO_LENGTH = 150;

export default function Profile() {
  const { user, signOut } = useAuth();
  const { profile, interests, updateProfile, updateInterests, uploadAvatar, calculateAge, refetch } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [editing, setEditing] = useState(false);
  const [nome, setNome] = useState('');
  const [bio, setBio] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Image cropper state
  const [cropperOpen, setCropperOpen] = useState(false);
  const [imageToCrop, setImageToCrop] = useState<string | null>(null);

  // Dialogs state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  // Check admin role
  useEffect(() => {
    if (!user) return;
    supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    if (profile) {
      setNome(profile.nome || '');
      setBio(profile.bio || '');
      setDataNascimento(profile.data_nascimento || '');
    }
    setSelectedInterests(interests.map(i => i.tag));
  }, [profile, interests]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setImageToCrop(reader.result as string);
        setCropperOpen(true);
      };
      reader.readAsDataURL(file);
    }
    // Reset input so same file can be selected again
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    const file = new File([croppedBlob], 'avatar.jpg', { type: 'image/jpeg' });
    const { error } = await uploadAvatar(file);
    if (error) {
      toast({ variant: 'destructive', title: 'Erro ao atualizar foto' });
    } else {
      toast({ title: 'Foto atualizada!' });
      refetch();
    }
    setImageToCrop(null);
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const validateForm = (): boolean => {
    if (!profile?.foto_url) {
      toast({ variant: 'destructive', title: 'Foto de perfil é obrigatória' });
      return false;
    }
    if (!nome.trim()) {
      toast({ variant: 'destructive', title: 'Nome é obrigatório' });
      return false;
    }
    if (!dataNascimento) {
      toast({ variant: 'destructive', title: 'Data de nascimento é obrigatória' });
      return false;
    }
    if (!bio.trim()) {
      toast({ variant: 'destructive', title: 'Bio é obrigatória' });
      return false;
    }
    if (bio.trim().length < MIN_BIO_LENGTH) {
      toast({ variant: 'destructive', title: `Bio deve ter pelo menos ${MIN_BIO_LENGTH} caracteres` });
      return false;
    }
    if (selectedInterests.length < 3) {
      toast({ variant: 'destructive', title: 'Selecione pelo menos 3 interesses' });
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      await updateProfile({ 
        nome: nome.trim(), 
        bio: bio.trim(),
        data_nascimento: dataNascimento
      });
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

  const getBioStatus = () => {
    const length = bio.trim().length;
    if (length === 0) return { color: 'text-muted-foreground', message: `0/${MAX_BIO_LENGTH}` };
    if (length < MIN_BIO_LENGTH) return { color: 'text-amber-500', message: `${length}/${MAX_BIO_LENGTH} (mín. ${MIN_BIO_LENGTH})` };
    return { color: 'text-muted-foreground', message: `${length}/${MAX_BIO_LENGTH}` };
  };

  const bioStatus = getBioStatus();

  return (
    <MobileLayout>
      <div className="p-4 space-y-4 page-fade pb-24">
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
              <div className="relative inline-block">
                <div className="h-24 w-24 rounded-lg ring-4 ring-card shadow-lg overflow-hidden bg-katu-blue">
                  {profile?.foto_url ? (
                    <img
                      src={profile.foto_url}
                      alt={profile.nome || ''}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-white text-2xl font-bold">
                      {profile?.nome?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                </div>
                <label className="absolute bottom-0 right-0 bg-accent text-accent-foreground rounded-full p-2 cursor-pointer hover:bg-accent/90 shadow-lg transition-transform hover:scale-105">
                  <Camera className="h-4 w-4" />
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={handleImageSelect} 
                    className="hidden" 
                  />
                </label>
              </div>
            </div>

            {/* Photo required warning */}
            {!profile?.foto_url && editing && (
              <div className="flex items-center gap-2 text-destructive text-sm mb-4 justify-center">
                <AlertCircle className="h-4 w-4" />
                <span>Foto de perfil é obrigatória</span>
              </div>
            )}

            {editing ? (
              <div className="space-y-4">
                {/* Name */}
                <div>
                  <Label className="text-sm font-medium">Nome *</Label>
                  <Input 
                    value={nome} 
                    onChange={(e) => setNome(e.target.value)} 
                    maxLength={50} 
                    className="mt-1.5 h-11 rounded-xl"
                    placeholder="Seu nome"
                  />
                </div>

                {/* Birth date */}
                <div>
                  <Label className="text-sm font-medium">Data de nascimento *</Label>
                  <Input 
                    type="date"
                    value={dataNascimento} 
                    onChange={(e) => setDataNascimento(e.target.value)} 
                    className="mt-1.5 h-11 rounded-xl"
                    max={new Date().toISOString().split('T')[0]}
                  />
                  {dataNascimento && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Idade: {calculateAge(dataNascimento)} anos
                    </p>
                  )}
                </div>

                {/* Bio */}
                <div>
                  <Label className="text-sm font-medium">Bio *</Label>
                  <Textarea 
                    value={bio} 
                    onChange={(e) => setBio(e.target.value)} 
                    maxLength={MAX_BIO_LENGTH} 
                    rows={3}
                    className="mt-1.5 rounded-xl resize-none"
                    placeholder="Conte um pouco sobre você..."
                  />
                  <p className={`text-xs text-right mt-1 ${bioStatus.color}`}>
                    {bioStatus.message}
                  </p>
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
              {editing && <span className="text-xs text-muted-foreground font-normal">(mín. 3)</span>}
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
          </CardContent>
        </Card>

        {/* Account Settings Card - Only in view mode */}
        {!editing && (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground" />
                Conta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button 
                variant="outline" 
                onClick={() => setEmailDialogOpen(true)}
                className="w-full justify-start h-11 rounded-xl"
              >
                <Mail className="h-4 w-4 mr-2" />
                Alterar email
                <span className="ml-auto text-xs text-muted-foreground truncate max-w-[140px]">
                  {user?.email}
                </span>
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setPasswordDialogOpen(true)}
                className="w-full justify-start h-11 rounded-xl"
              >
                <Lock className="h-4 w-4 mr-2" />
                Alterar senha
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 pt-2">
          {editing ? (
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setEditing(false);
                  // Reset to original values
                  if (profile) {
                    setNome(profile.nome || '');
                    setBio(profile.bio || '');
                    setDataNascimento(profile.data_nascimento || '');
                  }
                  setSelectedInterests(interests.map(i => i.tag));
                }} 
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
            <div className="space-y-3">
              <Button 
                variant="outline" 
                onClick={() => navigate('/admin/export')} 
                className="w-full h-11 rounded-xl"
              >
                <Database className="h-4 w-4 mr-2" />
                Admin Export
              </Button>
              <Button 
                variant="outline" 
                onClick={handleLogout} 
                className="w-full h-11 rounded-xl text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair da conta
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Image Cropper Dialog */}
      {imageToCrop && (
        <ImageCropper
          open={cropperOpen}
          onClose={() => {
            setCropperOpen(false);
            setImageToCrop(null);
          }}
          imageSrc={imageToCrop}
          onCropComplete={handleCropComplete}
        />
      )}

      {/* Email Change Dialog */}
      <EmailChangeDialog
        open={emailDialogOpen}
        onClose={() => setEmailDialogOpen(false)}
        currentEmail={user?.email || ''}
      />

      {/* Password Change Dialog */}
      <PasswordChangeDialog
        open={passwordDialogOpen}
        onClose={() => setPasswordDialogOpen(false)}
      />
    </MobileLayout>
  );
}
