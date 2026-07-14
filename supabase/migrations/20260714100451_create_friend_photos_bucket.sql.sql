-- Create the friend-photos storage bucket.
-- All prior migrations created RLS policies for this bucket but never created the bucket itself.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('friend-photos', 'friend-photos', false, 5242880, null)
ON CONFLICT (id) DO NOTHING;