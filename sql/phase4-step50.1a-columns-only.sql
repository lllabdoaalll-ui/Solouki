-- STEP 50.1a: columns only (run this first)
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS school_id uuid;
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS category text DEFAULT 'general';
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();
ALTER TABLE public.merit_records ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.merit_records SET category = 'general' WHERE category IS NULL;
UPDATE public.merit_records SET created_at = COALESCE(created_at, now()) WHERE created_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_merits_student ON public.merit_records(student_id, merit_date DESC);
CREATE INDEX IF NOT EXISTS idx_merits_stage ON public.merit_records(stage_id, merit_date DESC);

ALTER TABLE public.merit_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS merits_read_auth ON public.merit_records;
CREATE POLICY merits_read_auth ON public.merit_records
  FOR SELECT TO authenticated USING (true);

NOTIFY pgrst, 'reload schema';
