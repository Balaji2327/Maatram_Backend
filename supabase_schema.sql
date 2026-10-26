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
    
    -- Section 1: Personal & Contact Information
    full_name VARCHAR(255),
    dob DATE,
    gender VARCHAR(20),
    blood_group VARCHAR(10),
    aadhaar_number VARCHAR(20),
    mobile_number VARCHAR(20),
    alt_mobile_number VARCHAR(20),
    email VARCHAR(255),
    address TEXT,
    district VARCHAR(100),
    pincode VARCHAR(10),
    
    -- Section 2: Family Information
    father_name VARCHAR(255),
    father_occupation VARCHAR(255),
    father_income VARCHAR(50),
    mother_name VARCHAR(255),
    mother_occupation VARCHAR(255),
    mother_income VARCHAR(50),
    guardian_name VARCHAR(255),
    guardian_occupation VARCHAR(255),
    guardian_income VARCHAR(50),
    family_annual_income VARCHAR(50),
    housing_status VARCHAR(50), -- 'Own', 'Rented', 'Temporary'
    first_graduate BOOLEAN DEFAULT false,
    single_parent BOOLEAN DEFAULT false,
    orphan BOOLEAN DEFAULT false,
    differently_abled BOOLEAN DEFAULT false,
    siblings JSONB DEFAULT '[]'::jsonb, -- Array of { id, name, relationship, age, education, institution }
    
    -- Section 3: Academic Qualifications
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
    
    -- Section 4: College & Stream Preferences
    preferred_degree VARCHAR(100), -- 'B.E / B.Tech', 'Arts & Science', etc.
    preferred_courses JSONB DEFAULT '[]'::jsonb, -- Array of strings e.g. ['Computer Science', 'Information Technology']
    preferred_districts JSONB DEFAULT '[]'::jsonb,
    hostel_required BOOLEAN DEFAULT false,
    additional_remarks TEXT,
    
    -- Section 5: Documents (Storage File paths / URLs)
    document_10th_marksheet TEXT,
    document_11th_marksheet TEXT,
    document_12th_marksheet TEXT,
    document_aadhaar_card TEXT,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    submitted_at TIMESTAMP WITH TIME ZONE
);

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
-- Schema setup complete!
-- =========================================================================
