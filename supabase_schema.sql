-- =========================================================================
-- MAATRAM FOUNDATION - SUPABASE DATABASE SCHEMA
-- Execute this script in your Supabase Project -> SQL Editor
-- =========================================================================

-- 1. Enable UUID Extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create the Applications Table
-- Linked directly to Supabase Auth Users (auth.users.id)
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
    application_number VARCHAR(50) UNIQUE,
    
    -- Status & Workflow
    status VARCHAR(50) DEFAULT 'draft', 
    -- Possible statuses: 'draft', 'submitted', 'televerification', 'physical_verification', 'video_interview', 'final_interview', 'selected', 'rejected'
    current_stage VARCHAR(50) DEFAULT 'Stage 01', -- 'Stage 01', 'Stage 02', 'Stage 03', 'Stage 04'
    stage_status VARCHAR(50) DEFAULT 'In Progress',
    
    -- Personal & Contact Information
    full_name VARCHAR(255),
    dob DATE,
    gender VARCHAR(20),
    blood_group VARCHAR(10),
    aadhaar_number VARCHAR(20),
    mobile_number VARCHAR(20),
    alt_mobile_number VARCHAR(20),
    whatsapp_number VARCHAR(20),
    email VARCHAR(255),
    community VARCHAR(50), -- 'General / OC', 'BC', 'BCM', 'MBC / DNC', 'SC', 'SCA', 'ST'
    nationality VARCHAR(50) DEFAULT 'Indian',
    marital_status VARCHAR(50) DEFAULT 'Single',

    -- Family Information
    father_name VARCHAR(255),
    father_occupation VARCHAR(255),
    father_income VARCHAR(50),
    father_employment_status VARCHAR(100),
    mother_name VARCHAR(255),
    mother_occupation VARCHAR(255),
    mother_income VARCHAR(50),
    mother_employment_status VARCHAR(100),
    guardian_name VARCHAR(255),
    guardian_relation VARCHAR(100),
    guardian_occupation VARCHAR(255),
    guardian_income VARCHAR(50),
    family_annual_income VARCHAR(50),
    family_members_count VARCHAR(20),
    family_type VARCHAR(50), -- 'Nuclear', 'Joint'
    family_situation VARCHAR(100), -- 'Both parents living together', 'Single parent (Mother)', 'Single parent (Father)', 'Orphan'
    housing_status VARCHAR(50), -- 'Own', 'Rented', 'Leased', 'Govt Housing'
    first_graduate BOOLEAN DEFAULT false,
    single_parent BOOLEAN DEFAULT false,
    orphan BOOLEAN DEFAULT false,
    differently_abled BOOLEAN DEFAULT false,

    -- Siblings Information
    sibling_count VARCHAR(20),
    siblings_studying_count VARCHAR(20),
    siblings JSONB DEFAULT '[]'::jsonb, -- Array of { id, name, relationship, age, education, institution/occupation }

    -- Address Information
    permanent_address TEXT,
    current_address TEXT,
    address TEXT,
    village_town VARCHAR(255),
    district VARCHAR(100),
    state VARCHAR(100) DEFAULT 'Tamil Nadu',
    pincode VARCHAR(10),
    residence_type VARCHAR(50),
    college_distance VARCHAR(50),

    -- Academic Qualifications
    -- 10th Standard (SSLC)
    tenth_school_name VARCHAR(255),
    tenth_school_address TEXT,
    tenth_board VARCHAR(100),
    tenth_pass_year VARCHAR(10),
    tenth_marks_obtained NUMERIC(6, 2),
    tenth_max_marks NUMERIC(6, 2),
    tenth_percentage NUMERIC(5, 2),
    
    -- 11th Standard (HSC +1)
    eleventh_school_name VARCHAR(255),
    eleventh_school_address TEXT,
    eleventh_board VARCHAR(100),
    eleventh_pass_year VARCHAR(10),
    eleventh_subjects JSONB DEFAULT '[]'::jsonb, -- Array of { id, subjectName, maxMarks, marksObtained }
    eleventh_total_marks NUMERIC(6, 2),
    eleventh_max_marks NUMERIC(6, 2),
    eleventh_percentage NUMERIC(5, 2),
    
    -- 12th Standard (HSC +2)
    twelfth_school_name VARCHAR(255),
    twelfth_school_address TEXT,
    twelfth_board VARCHAR(100),
    twelfth_pass_year VARCHAR(10),
    twelfth_group VARCHAR(100), -- 'Bio-Maths', 'Computer Science', etc.
    twelfth_subjects JSONB DEFAULT '[]'::jsonb, -- Array of { id, subjectName, maxMarks, marksObtained }
    twelfth_total_marks NUMERIC(6, 2),
    twelfth_max_marks NUMERIC(6, 2),
    twelfth_percentage NUMERIC(5, 2),
    twelfth_cutoff NUMERIC(6, 2),
    
    -- Higher Education Preferences
    preferred_degree VARCHAR(100), -- 'B.E / B.Tech', 'Arts & Science', etc.
    preferred_branch VARCHAR(255),
    second_branch VARCHAR(255),
    preferred_courses JSONB DEFAULT '[]'::jsonb,
    preferred_districts JSONB DEFAULT '[]'::jsonb,
    preferred_college_location VARCHAR(255),
    hostel_required BOOLEAN DEFAULT false,

    -- Financial Information
    monthly_family_income VARCHAR(50),
    income_sources TEXT,
    family_debts TEXT,
    education_loans TEXT,
    financial_difficulties TEXT,
    why_need_support TEXT,
    affordability_without_support TEXT,

    -- Personal & Background Information
    first_generation_learner BOOLEAN DEFAULT false,
    special_circumstances TEXT,
    career_ambition TEXT,
    higher_education_reason TEXT,
    willing_to_relocate_tn BOOLEAN DEFAULT true,
    future_goals TEXT,
    additional_remarks TEXT,
    
    -- Documents (AWS S3 Object Keys / URLs)
    student_photo TEXT,
    document_10th_marksheet TEXT,
    document_11th_marksheet TEXT,
    document_12th_marksheet TEXT,
    document_community_certificate TEXT,
    document_income_certificate TEXT,
    document_aadhaar_card TEXT,
    document_parent_id_proof TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE
);

-- =========================================================================
-- Idempotent Migration: Add new columns if table already exists in Supabase
-- =========================================================================
DO $$
BEGIN
    -- Personal Information
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='whatsapp_number') THEN
        ALTER TABLE public.applications ADD COLUMN whatsapp_number VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='community') THEN
        ALTER TABLE public.applications ADD COLUMN community VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='nationality') THEN
        ALTER TABLE public.applications ADD COLUMN nationality VARCHAR(50) DEFAULT 'Indian';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='marital_status') THEN
        ALTER TABLE public.applications ADD COLUMN marital_status VARCHAR(50) DEFAULT 'Single';
    END IF;

    -- Family Information
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='father_employment_status') THEN
        ALTER TABLE public.applications ADD COLUMN father_employment_status VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='mother_employment_status') THEN
        ALTER TABLE public.applications ADD COLUMN mother_employment_status VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='guardian_relation') THEN
        ALTER TABLE public.applications ADD COLUMN guardian_relation VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='family_members_count') THEN
        ALTER TABLE public.applications ADD COLUMN family_members_count VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='family_type') THEN
        ALTER TABLE public.applications ADD COLUMN family_type VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='family_situation') THEN
        ALTER TABLE public.applications ADD COLUMN family_situation VARCHAR(100);
    END IF;

    -- Siblings Information
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='sibling_count') THEN
        ALTER TABLE public.applications ADD COLUMN sibling_count VARCHAR(20);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='siblings_studying_count') THEN
        ALTER TABLE public.applications ADD COLUMN siblings_studying_count VARCHAR(20);
    END IF;

    -- Address Information
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='permanent_address') THEN
        ALTER TABLE public.applications ADD COLUMN permanent_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='current_address') THEN
        ALTER TABLE public.applications ADD COLUMN current_address TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='village_town') THEN
        ALTER TABLE public.applications ADD COLUMN village_town VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='state') THEN
        ALTER TABLE public.applications ADD COLUMN state VARCHAR(100) DEFAULT 'Tamil Nadu';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='residence_type') THEN
        ALTER TABLE public.applications ADD COLUMN residence_type VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='college_distance') THEN
        ALTER TABLE public.applications ADD COLUMN college_distance VARCHAR(50);
    END IF;

    -- Educational Preferences
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='preferred_branch') THEN
        ALTER TABLE public.applications ADD COLUMN preferred_branch VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='second_branch') THEN
        ALTER TABLE public.applications ADD COLUMN second_branch VARCHAR(255);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='preferred_college_location') THEN
        ALTER TABLE public.applications ADD COLUMN preferred_college_location VARCHAR(255);
    END IF;

    -- Financial Information
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='monthly_family_income') THEN
        ALTER TABLE public.applications ADD COLUMN monthly_family_income VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='income_sources') THEN
        ALTER TABLE public.applications ADD COLUMN income_sources TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='family_debts') THEN
        ALTER TABLE public.applications ADD COLUMN family_debts TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='education_loans') THEN
        ALTER TABLE public.applications ADD COLUMN education_loans TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='financial_difficulties') THEN
        ALTER TABLE public.applications ADD COLUMN financial_difficulties TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='why_need_support') THEN
        ALTER TABLE public.applications ADD COLUMN why_need_support TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='affordability_without_support') THEN
        ALTER TABLE public.applications ADD COLUMN affordability_without_support TEXT;
    END IF;

    -- Personal & Background Information
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='first_generation_learner') THEN
        ALTER TABLE public.applications ADD COLUMN first_generation_learner BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='special_circumstances') THEN
        ALTER TABLE public.applications ADD COLUMN special_circumstances TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='career_ambition') THEN
        ALTER TABLE public.applications ADD COLUMN career_ambition TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='higher_education_reason') THEN
        ALTER TABLE public.applications ADD COLUMN higher_education_reason TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='willing_to_relocate_tn') THEN
        ALTER TABLE public.applications ADD COLUMN willing_to_relocate_tn BOOLEAN DEFAULT true;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='future_goals') THEN
        ALTER TABLE public.applications ADD COLUMN future_goals TEXT;
    END IF;

    -- Documents
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='student_photo') THEN
        ALTER TABLE public.applications ADD COLUMN student_photo TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='document_community_certificate') THEN
        ALTER TABLE public.applications ADD COLUMN document_community_certificate TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='document_income_certificate') THEN
        ALTER TABLE public.applications ADD COLUMN document_income_certificate TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='applications' AND column_name='document_parent_id_proof') THEN
        ALTER TABLE public.applications ADD COLUMN document_parent_id_proof TEXT;
    END IF;
END $$;

-- 3. Row Level Security (RLS) Policies
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own application
DROP POLICY IF EXISTS "Users can view their own application" ON public.applications;
CREATE POLICY "Users can view their own application"
    ON public.applications
    FOR SELECT
    USING (auth.uid() = user_id);

-- Allow users to insert their own application
DROP POLICY IF EXISTS "Users can create their own application" ON public.applications;
CREATE POLICY "Users can create their own application"
    ON public.applications
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own application
DROP POLICY IF EXISTS "Users can update their own application" ON public.applications;
CREATE POLICY "Users can update their own application"
    ON public.applications
    FOR UPDATE
    USING (auth.uid() = user_id);

-- 4. Automatic Application Number Generation Function
CREATE OR REPLACE FUNCTION generate_application_number()
RETURNS TRIGGER AS $$
DECLARE
    next_num INT;
BEGIN
    IF NEW.application_number IS NULL OR NEW.application_number = '' THEN
        -- Get count + 1 for sequential identifier
        SELECT COUNT(*) + 1 INTO next_num FROM public.applications;
        NEW.application_number := 'MF-2025-' || LPAD(next_num::TEXT, 3, '0');
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Trigger for Application Number on Insertion
DROP TRIGGER IF EXISTS trigger_generate_app_number ON public.applications;
CREATE TRIGGER trigger_generate_app_number
    BEFORE INSERT ON public.applications
    FOR EACH ROW
    EXECUTE FUNCTION generate_application_number();

-- 6. Trigger for Updated At Timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_timestamp ON public.applications;
CREATE TRIGGER trigger_update_timestamp
    BEFORE UPDATE ON public.applications
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- =========================================================================
-- 7. Administrators Table & Security Settings
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.administrators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'admin', -- 'super_admin', 'admin', 'reviewer'
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_secret VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Trigger for Administrators Updated At Timestamp
DROP TRIGGER IF EXISTS trigger_update_admin_timestamp ON public.administrators;
CREATE TRIGGER trigger_update_admin_timestamp
    BEFORE UPDATE ON public.administrators
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Seed Primary Administrator:
-- Email: admin@maatram.com
-- Initial password: admin@123 (sha256 hash: "d8e8fca2dc0f896fd7cb4cb0031ba249")
INSERT INTO public.administrators (
    name,
    email,
    password_hash,
    role,
    two_factor_enabled
)
VALUES (
    'Maatram Primary Administrator',
    'admin@maatram.com',
    'd8e8fca2dc0f896fd7cb4cb0031ba249',
    'super_admin',
    false
)
ON CONFLICT (email) DO UPDATE
SET role = 'super_admin';

-- =========================================================================
-- 8. Posts & Events Tables
-- =========================================================================
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
    status VARCHAR(50) DEFAULT 'upcoming',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view posts" ON public.posts;
CREATE POLICY "Public can view posts" ON public.posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public can view events" ON public.events;
CREATE POLICY "Public can view events" ON public.events FOR SELECT USING (true);

-- 9. Storage Bucket Configuration (maatram_bucket)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('maatram_bucket', 'maatram_bucket', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public Access to maatram_bucket" ON storage.objects;
CREATE POLICY "Public Access to maatram_bucket" ON storage.objects
FOR SELECT USING (bucket_id = 'maatram_bucket');

-- =========================================================================
-- Schema setup complete!
-- =========================================================================

