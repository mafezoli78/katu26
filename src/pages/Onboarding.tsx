import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useProfile } from '@/hooks/useProfile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { Camera, X, Check } from 'lucide-react';
import logoKatu from '@/assets/logo-katu-branco.png';

const AVAILABLE_INTERESTS = [
  'Música', 'Cinema', 'Esportes', 'Tecnologia', 'Viagens', 'Gastronomia',
  'Arte', 'Fotografia', 'Leitura', 'Games', 'Natureza', 'Yoga',
  'Dança', 'Teatro', 'Empreendedorismo', 'Fitness', 'Pets', 'Café'
];

export default function Onboarding() {
  const { user } = useAuth();
  const { profile, updateProfile, updateInterests, uploadAvatar, isProfileComplete } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [step, setStep] = useState(1);
  const [nome, setNome] = useState('');
  const [dataNascimento, setDataNascimento] = useState('');
  const [bio, setBio] = useState('');
  const [selectedInterests, setSelectedInterests] = useState<string[]>([]);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [ageError, setAgeError] = useState('');

  useEffect(() => {
    if (!user) {
      navigate('/auth', { replace: true });
    } else if (isProfileComplete()) {
      navigate('/home', { replace: true });
    }
  }, [user, isProfileComplete, navigate]);

  useEffect(() => {
    if (profile) {
      if (profile.nome) setNome(profile.nome);
      if (profile.data_nascimento) setDataNascimento(profile.data_nascimento);
      if (profile.bio) setBio(profile.bio);
      if (profile.foto_url) setAvatarPreview(profile.foto_url);
    }
  }, [profile]);

  const validateAge = (birthDate: string): boolean => {
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    
    if (age < 18) {
      setAgeError('Você precisa ter pelo menos 18 anos para usar o Katu');
      return false;
    }
    setAgeError('');
    return true;
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const toggleInterest = (interest: string) => {
    setSelectedInterests(prev =>
      prev.includes(interest)
        ? prev.filter(i => i !== interest)
        : [...prev, interest]
    );
  };

  const handleNextStep = async () => {
    if (step === 1) {
      if (!nome.trim()) {
        toast({ variant: 'destructive', title: 'Por favor, insira seu nome' });
        return;
      }
      if (!dataNascimento) {
        toast({ variant: 'destructive', title: 'Por favor, insira sua data de nascimento' });
        return;
      }
      if (!validateAge(dataNascimento)) {
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (selectedInterests.length < 3) {
        toast({ variant: 'destructive', title: 'Selecione pelo menos 3 interesses' });
        return;
      }
      setStep(3);
    }
  };

  const handleComplete = async () => {
    setLoading(true);
    try {
      // Upload avatar if selected
      if (avatarFile) {
        await uploadAvatar(avatarFile);
      }

      // Update profile
      const { error: profileError } = await updateProfile({
        nome: nome.trim(),
        data_nascimento: dataNascimento,
        bio: bio.trim() || null,
      });

      if (profileError) throw profileError;

      // Update interests
      const { error: interestsError } = await updateInterests(selectedInterests);
      if (interestsError) throw interestsError;

      toast({ title: 'Perfil criado com sucesso!' });
      navigate('/home', { replace: true });
    } catch (error) {
      console.error('Error completing onboarding:', error);
      toast({ variant: 'destructive', title: 'Erro ao salvar perfil' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary p-6 flex items-center justify-center">
        <img src={logoKatu} alt="Katu" className="w-20 h-auto" />
      </div>

      {/* Progress indicator */}
      <div className="flex justify-center gap-2 py-4">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-2 w-12 rounded-full transition-colors ${
              s <= step ? 'bg-accent' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      <div className="p-4 page-enter">
        {/* Step 1: Basic Info */}
        {step === 1 && (
          <Card>
            <CardHeader>
              <CardTitle>Vamos começar!</CardTitle>
              <CardDescription>Nos conte um pouco sobre você</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Avatar upload */}
              <div className="flex justify-center">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={avatarPreview || undefined} />
                    <AvatarFallback className="bg-primary text-primary-foreground text-2xl">
                      {nome ? nome[0].toUpperCase() : '?'}
                    </AvatarFallback>
                  </Avatar>
                  <label className="absolute bottom-0 right-0 bg-accent text-accent-foreground rounded-full p-2 cursor-pointer hover:bg-accent/90 transition-colors">
                    <Camera className="h-4 w-4" />
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nome">Nome *</Label>
                <Input
                  id="nome"
                  placeholder="Como você quer ser chamado?"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  maxLength={50}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataNascimento">Data de nascimento *</Label>
                <Input
                  id="dataNascimento"
                  type="date"
                  value={dataNascimento}
                  onChange={(e) => {
                    setDataNascimento(e.target.value);
                    validateAge(e.target.value);
                  }}
                  max={new Date().toISOString().split('T')[0]}
                />
                {ageError && (
                  <p className="text-sm text-destructive">{ageError}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio (opcional)</Label>
                <Textarea
                  id="bio"
                  placeholder="Uma breve descrição sobre você..."
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={150}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground text-right">
                  {bio.length}/150
                </p>
              </div>

              <Button 
                onClick={handleNextStep}
                className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
                disabled={!!ageError}
              >
                Continuar
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Interests */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Seus interesses</CardTitle>
              <CardDescription>
                Selecione pelo menos 3 interesses para encontrar pessoas com gostos parecidos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {AVAILABLE_INTERESTS.map((interest) => {
                  const isSelected = selectedInterests.includes(interest);
                  return (
                    <Badge
                      key={interest}
                      variant={isSelected ? 'default' : 'outline'}
                      className={`cursor-pointer transition-all py-2 px-3 ${
                        isSelected 
                          ? 'bg-secondary text-secondary-foreground hover:bg-secondary/90' 
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                      {isSelected && <Check className="ml-1 h-3 w-3" />}
                    </Badge>
                  );
                })}
              </div>

              <p className="text-sm text-muted-foreground">
                {selectedInterests.length} de 3 ou mais selecionados
              </p>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                  Voltar
                </Button>
                <Button 
                  onClick={handleNextStep}
                  className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                >
                  Continuar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Review */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Tudo pronto!</CardTitle>
              <CardDescription>Confira seu perfil antes de continuar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16">
                  <AvatarImage src={avatarPreview || undefined} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                    {nome[0].toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <h3 className="font-semibold text-lg">{nome}</h3>
                  {bio && <p className="text-sm text-muted-foreground">{bio}</p>}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium mb-2">Seus interesses:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedInterests.map((interest) => (
                    <Badge key={interest} variant="secondary">
                      {interest}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                  Voltar
                </Button>
                <Button 
                  onClick={handleComplete}
                  className="flex-1 bg-accent text-accent-foreground hover:bg-accent/90"
                  disabled={loading}
                >
                  {loading ? 'Salvando...' : 'Começar a usar'}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
