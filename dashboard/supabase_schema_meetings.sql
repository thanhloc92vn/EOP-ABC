-- SQL Schema to create the 'meetings' table and setup storage for meeting recordings & documents.
-- Copy this query, go to Supabase -> SQL Editor -> New Query, paste and run it.

CREATE TABLE IF NOT EXISTS public.meetings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  title TEXT NOT NULL,
  meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TEXT DEFAULT '09:00',
  end_time TEXT DEFAULT '10:30',
  location TEXT,
  chairperson TEXT,
  secretary TEXT,
  attendees TEXT[] DEFAULT '{}'::TEXT[],
  project_name TEXT,
  package_name TEXT,
  audio_url TEXT,
  transcript_raw TEXT,
  transcript_clean TEXT,
  summary TEXT,
  action_items JSONB DEFAULT '[]'::JSONB,
  document_url TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed')),
  distribution TEXT DEFAULT 'P. KHĐT, P. QLDA, P. VTTB; Lưu: HCNS.'
);

-- Disable Row Level Security (RLS) so the client can perform read/write operations directly
ALTER TABLE public.meetings DISABLE ROW LEVEL SECURITY;

-- Enable public access policies just in case RLS is re-enabled globally
DROP POLICY IF EXISTS "Allow public select for meetings" ON public.meetings;
CREATE POLICY "Allow public select for meetings" ON public.meetings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert for meetings" ON public.meetings;
CREATE POLICY "Allow public insert for meetings" ON public.meetings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update for meetings" ON public.meetings;
CREATE POLICY "Allow public update for meetings" ON public.meetings FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete for meetings" ON public.meetings;
CREATE POLICY "Allow public delete for meetings" ON public.meetings FOR DELETE USING (true);


-- ━━━ STORAGE BUCKET CONFIGURATION ━━━
-- Create 'meetings' bucket for storing meeting audio files and generated Word documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'meetings', 
  'meetings', 
  true, 
  524288000, -- Limit 500MB per file for audio recordings
  ARRAY[
    'audio/mpeg', 
    'audio/mp3', 
    'audio/wav', 
    'audio/x-wav', 
    'audio/m4a', 
    'audio/x-m4a', 
    'audio/mp4',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = 524288000,
  allowed_mime_types = ARRAY[
    'audio/mpeg', 
    'audio/mp3', 
    'audio/wav', 
    'audio/x-wav', 
    'audio/m4a', 
    'audio/x-m4a', 
    'audio/mp4',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ];

-- Storage Policies for 'meetings' bucket
DROP POLICY IF EXISTS "Allow public select for meetings bucket" ON storage.objects;
CREATE POLICY "Allow public select for meetings bucket" ON storage.objects FOR SELECT USING (bucket_id = 'meetings');

DROP POLICY IF EXISTS "Allow public insert for meetings bucket" ON storage.objects;
CREATE POLICY "Allow public insert for meetings bucket" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'meetings');

DROP POLICY IF EXISTS "Allow public update for meetings bucket" ON storage.objects;
CREATE POLICY "Allow public update for meetings bucket" ON storage.objects FOR UPDATE USING (bucket_id = 'meetings');

DROP POLICY IF EXISTS "Allow public delete for meetings bucket" ON storage.objects;
CREATE POLICY "Allow public delete for meetings bucket" ON storage.objects FOR DELETE USING (bucket_id = 'meetings');
