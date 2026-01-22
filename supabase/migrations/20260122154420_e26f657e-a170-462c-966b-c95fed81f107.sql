-- Create intentions table with predefined values
CREATE TABLE public.intentions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL UNIQUE,
  descricao TEXT
);

-- Insert default intentions
INSERT INTO public.intentions (nome, descricao) VALUES
  ('Conversar', 'Bater um papo casual'),
  ('Networking', 'Fazer contatos profissionais'),
  ('Companhia', 'Buscar companhia para o momento'),
  ('Conhecer pessoas', 'Conhecer novas pessoas'),
  ('Livre', 'Aberto a qualquer interação');

-- Enable RLS on intentions (public read)
ALTER TABLE public.intentions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Intentions are viewable by everyone" 
ON public.intentions FOR SELECT 
USING (true);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  data_nascimento DATE,
  bio TEXT,
  foto_url TEXT,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" 
ON public.profiles FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own profile" 
ON public.profiles FOR INSERT 
WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" 
ON public.profiles FOR UPDATE 
USING (auth.uid() = id);

-- Create user_interests table
CREATE TABLE public.user_interests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, tag)
);

-- Enable RLS on user_interests
ALTER TABLE public.user_interests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all interests" 
ON public.user_interests FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own interests" 
ON public.user_interests FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own interests" 
ON public.user_interests FOR DELETE 
USING (auth.uid() = user_id);

-- Create locations table
CREATE TABLE public.locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  raio INTEGER NOT NULL DEFAULT 100,
  status_aprovacao TEXT NOT NULL DEFAULT 'pendente' CHECK (status_aprovacao IN ('pendente', 'aprovado', 'rejeitado')),
  criado_por UUID REFERENCES public.profiles(id),
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on locations
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view approved locations" 
ON public.locations FOR SELECT 
USING (status_aprovacao = 'aprovado' OR criado_por = auth.uid());

CREATE POLICY "Authenticated users can suggest locations" 
ON public.locations FOR INSERT 
WITH CHECK (auth.uid() IS NOT NULL);

-- Create presence table
CREATE TABLE public.presence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  intention_id UUID NOT NULL REFERENCES public.intentions(id),
  inicio TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ultima_atividade TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  ativo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(user_id)
);

-- Enable RLS on presence
ALTER TABLE public.presence ENABLE ROW LEVEL SECURITY;

-- Users can view presence of others in the same location
CREATE POLICY "Users can view presence in same location" 
ON public.presence FOR SELECT 
USING (
  ativo = true AND (
    auth.uid() = user_id OR
    location_id IN (
      SELECT location_id FROM public.presence 
      WHERE user_id = auth.uid() AND ativo = true
    )
  )
);

CREATE POLICY "Users can insert their own presence" 
ON public.presence FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own presence" 
ON public.presence FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own presence" 
ON public.presence FOR DELETE 
USING (auth.uid() = user_id);

-- Create waves table
CREATE TABLE public.waves (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  de_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  para_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  criado_em TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  visualizado BOOLEAN NOT NULL DEFAULT false,
  UNIQUE(de_user_id, para_user_id, location_id)
);

-- Enable RLS on waves
ALTER TABLE public.waves ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view waves they sent or received" 
ON public.waves FOR SELECT 
USING (auth.uid() = de_user_id OR auth.uid() = para_user_id);

CREATE POLICY "Users can send waves" 
ON public.waves FOR INSERT 
WITH CHECK (auth.uid() = de_user_id);

CREATE POLICY "Users can update waves they received" 
ON public.waves FOR UPDATE 
USING (auth.uid() = para_user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for profiles
CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to handle new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger for new user signup
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

-- Create storage bucket for profile photos
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true);

-- Create storage policies
CREATE POLICY "Avatar images are publicly accessible" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'avatars');

CREATE POLICY "Users can upload their own avatar" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own avatar" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own avatar" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);