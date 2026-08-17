-- ============================================================
-- 052 — VÁ POLICY UPDATE CỦA signing_submissions (thiếu WITH CHECK)
--
-- LỖI:
-- Policy "signing_update" ở migration 050 chỉ khai USING, không khai WITH CHECK.
-- Trong PostgreSQL, UPDATE mà thiếu WITH CHECK thì biểu thức USING được áp
-- LUÔN cho DÒNG SAU KHI SỬA. Hệ quả:
--
--   PGĐ QLDA bấm duyệt -> status đổi 'cho_pgd_qlda' thành 'cho_pgd_khdt'
--   USING      : old.status = 'cho_pgd_qlda' ∈ stages của họ  -> QUA
--   WITH CHECK : new.status = 'cho_pgd_khdt' ∉ stages của họ  -> CHẶN
--
-- => "new row violates row-level security policy". MỌI cấp duyệt đều tắc ngay
-- bước đầu, trừ Admin và người lập phiếu (hai nhánh kia của USING vẫn đúng sau
-- khi sửa). Lỗi chỉ lộ ra khi có người thật bấm duyệt nên không phát hiện được
-- lúc chạy migration.
--
-- CÁCH VÁ:
-- WITH CHECK chỉ cần khẳng định "người này có chân trong luồng" — KHÔNG diễn tả
-- luật chuyển bước ở đây, vì WITH CHECK không nhìn thấy OLD nên không thể biết
-- phiếu đi từ đâu sang đâu. Luật chuyển bước đã nằm trọn trong trigger
-- guard_signing_transition (migration 050) và vẫn chạy nguyên vẹn.
--
-- CÁCH CHẠY: Supabase Dashboard -> SQL Editor. An toàn chạy lại nhiều lần.
-- YÊU CẦU: đã chạy 050.
-- ============================================================

drop policy if exists "signing_update" on public.signing_submissions;

create policy "signing_update" on public.signing_submissions
  for update to authenticated
  using (
    public.is_admin_caller()
    or (coalesce(auth.jwt() ->> 'email', '') <> ''
        and lower(created_by) = lower(auth.jwt() ->> 'email'))
    or status = any(public.signing_stages_of_caller())
  )
  with check (
    public.is_admin_caller()
    or (coalesce(auth.jwt() ->> 'email', '') <> ''
        and lower(created_by) = lower(auth.jwt() ->> 'email'))
    -- Người giữ BẤT KỲ cờ duyệt nào cũng được ghi ra dòng có trạng thái mới,
    -- kể cả trạng thái của bước kế tiếp mà họ không phụ trách.
    or public.signing_is_participant()
  );

-- ─── KIỂM TRA ───
-- Phải thấy signing_update có ĐỦ cả qual (USING) lẫn with_check.
select policyname, cmd,
       qual       is not null as co_using,
       with_check is not null as co_with_check
from pg_policies
where schemaname = 'public' and tablename = 'signing_submissions'
order by policyname;
