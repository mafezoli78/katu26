
-- Add selfie columns to presence table
ALTER TABLE public.presence
ADD COLUMN checkin_selfie_url text DEFAULT NULL,
ADD COLUMN checkin_selfie_created_at timestamp with time zone DEFAULT NULL;

-- Create storage bucket for check-in selfies
INSERT INTO storage.buckets (id, name, public)
VALUES ('checkin-selfies', 'checkin-selfies', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for checkin-selfies bucket
CREATE POLICY "Users can upload their own checkin selfie"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'checkin-selfies' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Checkin selfies are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'checkin-selfies');

CREATE POLICY "Users can delete their own checkin selfie"
ON storage.objects FOR DELETE
USING (bucket_id = 'checkin-selfies' AND auth.uid()::text = (storage.foldername(name))[1]);
