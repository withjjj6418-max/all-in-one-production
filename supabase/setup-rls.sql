-- ============================================
-- Supabase RLS 정책 설정
-- 인증 없이 anon 역할로 CRUD 가능하도록 설정
-- Supabase Dashboard > SQL Editor 에서 실행
-- ============================================

-- 1. projects 테이블
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon full access on projects"
  ON projects
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- 2. channels 테이블
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon full access on channels"
  ON channels
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- 3. research 테이블
ALTER TABLE research ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon full access on research"
  ON research
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);
