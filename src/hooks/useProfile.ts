import { useState, useEffect } from 'react';
import { calculateAge } from '@/utils/date';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Profile {
  id: string;
  nome: string | null;
  data_nascimento: string | null;
  bio: string | null;
  foto_url: string | null;
  criado_em: string;
  atualizado_em: string;
}

export interface UserInterest {
  id: string;
  user_id: string;
  tag: string;
}

export function useProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [interests, setInterests] = useState<UserInterest[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    if (!user) {
      setProfile(null);
      setInterests([]);
      setLoading(false);
      return;
    }

    try {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      const { data: interestsData, error: interestsError } = await supabase
        .from('user_interests')
        .select('*')
        .eq('user_id', user.id);

      if (interestsError) throw interestsError;
      setInterests(interestsData || []);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const updateProfile = async (updates: Partial<Profile>) => {
    if (!user) return { error: new Error('Not authenticated') };

    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id);

    if (!error) {
      setProfile(prev => prev ? { ...prev, ...updates } : null);
    }

    return { error };
  };

  const updateInterests = async (tags: string[]) => {
    if (!user) return { error: new Error('Not authenticated') };

    // Delete existing interests
    await supabase
      .from('user_interests')
      .delete()
      .eq('user_id', user.id);

    // Insert new interests
    if (tags.length > 0) {
      const { error } = await supabase
        .from('user_interests')
        .insert(tags.map(tag => ({ user_id: user.id, tag })));

      if (error) return { error };
    }

    await fetchProfile();
    return { error: null };
  };

  const uploadAvatar = async (file: File) => {
    if (!user) return { error: new Error('Not authenticated'), url: null };

    const fileExt = file.name.split('.').pop();
    const fileName = `${user.id}/avatar.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(fileName, file, { upsert: true });

    if (uploadError) return { error: uploadError, url: null };

    const { data } = supabase.storage
      .from('avatars')
      .getPublicUrl(fileName);

    const foto_url = `${data.publicUrl}?t=${Date.now()}`;
    await updateProfile({ foto_url });

    return { error: null, url: foto_url };
  };

  const isProfileComplete = () => {
    return profile?.nome && profile?.data_nascimento && interests.length > 0;
  };

  // Re-export calculateAge from shared utility
  // calculateAge is imported from @/utils/date

  return {
    profile,
    interests,
    loading,
    updateProfile,
    updateInterests,
    uploadAvatar,
    isProfileComplete,
    calculateAge,
    refetch: fetchProfile,
  };
}
