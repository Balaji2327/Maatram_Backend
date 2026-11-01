-- =========================================================================
-- MAATRAM FOUNDATION - POSTS & EVENTS SUPABASE SCHEMA
-- Copy and run this script in your Supabase Project -> SQL Editor
-- =========================================================================

-- 1. Ensure UUID Extension is active
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create the Posts Table
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100) DEFAULT 'Announcement',
    schedule_date VARCHAR(50),
    schedule_time VARCHAR(50),
    location VARCHAR(255),
    language VARCHAR(50) DEFAULT 'English',
    author_name VARCHAR(255) DEFAULT 'Foundation Admin',
    image_url TEXT,
    images JSONB DEFAULT '[]'::jsonb,
    video_url TEXT,
    video_file_name VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger for posts updated_at
CREATE OR REPLACE FUNCTION update_posts_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_posts_timestamp ON public.posts;
CREATE TRIGGER trigger_update_posts_timestamp
    BEFORE UPDATE ON public.posts
    FOR EACH ROW
    EXECUTE FUNCTION update_posts_timestamp();

-- 3. Create the Events Table
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    description TEXT NOT NULL,
    event_date VARCHAR(50) NOT NULL,
    event_time VARCHAR(100),
    location VARCHAR(255) NOT NULL,
    category VARCHAR(100) DEFAULT 'Workshop',
    target_audience VARCHAR(255),
    image_url TEXT,
    status VARCHAR(50) DEFAULT 'upcoming', -- 'upcoming', 'ongoing', 'completed', 'cancelled'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger for events updated_at
CREATE OR REPLACE FUNCTION update_events_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_events_timestamp ON public.events;
CREATE TRIGGER trigger_update_events_timestamp
    BEFORE UPDATE ON public.events
    FOR EACH ROW
    EXECUTE FUNCTION update_events_timestamp();

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Allow public read access to posts and events
DROP POLICY IF EXISTS "Public can view posts" ON public.posts;
CREATE POLICY "Public can view posts" ON public.posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view events" ON public.events;
CREATE POLICY "Public can view events" ON public.events FOR SELECT USING (true);

-- Allow backend service role full access
DROP POLICY IF EXISTS "Full access for service role on posts" ON public.posts;
CREATE POLICY "Full access for service role on posts" ON public.posts FOR ALL USING (true);

DROP POLICY IF EXISTS "Full access for service role on events" ON public.events;
CREATE POLICY "Full access for service role on events" ON public.events FOR ALL USING (true);

-- 5. Storage Bucket Configuration (maatram_bucket)
-- Note: In Supabase dashboard -> Storage, ensure bucket 'maatram_bucket' is set to Public
-- or execute the following to ensure public access to objects:
INSERT INTO storage.buckets (id, name, public) 
VALUES ('maatram_bucket', 'maatram_bucket', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access to maatram_bucket" ON storage.objects;
CREATE POLICY "Public Access to maatram_bucket" ON storage.objects
FOR SELECT USING (bucket_id = 'maatram_bucket');

DROP POLICY IF EXISTS "Allow Uploads to maatram_bucket" ON storage.objects;
CREATE POLICY "Allow Uploads to maatram_bucket" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'maatram_bucket');

DROP POLICY IF EXISTS "Allow Updates to maatram_bucket" ON storage.objects;
CREATE POLICY "Allow Updates to maatram_bucket" ON storage.objects
FOR UPDATE USING (bucket_id = 'maatram_bucket');

DROP POLICY IF EXISTS "Allow Deletes from maatram_bucket" ON storage.objects;
CREATE POLICY "Allow Deletes from maatram_bucket" ON storage.objects
FOR DELETE USING (bucket_id = 'maatram_bucket');
