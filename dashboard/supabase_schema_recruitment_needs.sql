-- Create table for recruitment needs
CREATE TABLE IF NOT EXISTS public.recruitment_needs (
    id TEXT PRIMARY KEY, -- 'office_manual_needs' or 'project_manual_needs'
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.recruitment_needs ENABLE ROW LEVEL SECURITY;

-- Policies for public read/write
CREATE POLICY "Allow public read recruitment_needs" ON public.recruitment_needs
    FOR SELECT USING (true);

CREATE POLICY "Allow public insert recruitment_needs" ON public.recruitment_needs
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update recruitment_needs" ON public.recruitment_needs
    FOR UPDATE USING (true);

-- Insert default values if not exists
INSERT INTO public.recruitment_needs (id, data) VALUES 
('office_manual_needs', '{"HCNS": 2, "Phòng QLDA": 1, "Kế toán": 1}'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.recruitment_needs (id, data) VALUES 
('project_manual_needs', '{"Vàm Lẽo": 3, "RXT": 2, "Mã Đà": 1, "ĐMT Trà Vinh": 2}'::jsonb)
ON CONFLICT (id) DO NOTHING;
