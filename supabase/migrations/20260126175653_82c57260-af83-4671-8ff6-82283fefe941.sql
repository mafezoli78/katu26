-- Add status column to waves table
ALTER TABLE public.waves 
ADD COLUMN status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted'));

-- Add expires_at column to waves (linked to presence expiration)
ALTER TABLE public.waves
ADD COLUMN expires_at timestamp with time zone;

-- Add accepted_by column to waves (who accepted the wave)
ALTER TABLE public.waves
ADD COLUMN accepted_by uuid REFERENCES public.profiles(id);

-- Create index for status queries
CREATE INDEX idx_waves_status ON public.waves(status);

-- Create index for expires_at queries
CREATE INDEX idx_waves_expires_at ON public.waves(expires_at);

-- Create conversations table for matched waves
CREATE TABLE public.conversations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user1_id uuid NOT NULL REFERENCES public.profiles(id),
  user2_id uuid NOT NULL REFERENCES public.profiles(id),
  place_id uuid NOT NULL REFERENCES public.places(id),
  origem_wave_id uuid REFERENCES public.waves(id) ON DELETE SET NULL,
  criado_em timestamp with time zone NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

-- Policies for conversations
CREATE POLICY "Users can view their conversations"
ON public.conversations
FOR SELECT
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can create conversations they're part of"
ON public.conversations
FOR INSERT
WITH CHECK (auth.uid() = user1_id OR auth.uid() = user2_id);

CREATE POLICY "Users can update their conversations"
ON public.conversations
FOR UPDATE
USING (auth.uid() = user1_id OR auth.uid() = user2_id);

-- Unique constraint to prevent duplicate conversations between same users at same place
CREATE UNIQUE INDEX idx_conversations_unique_pair 
ON public.conversations (LEAST(user1_id, user2_id), GREATEST(user1_id, user2_id), place_id)
WHERE ativo = true;