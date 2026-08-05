-- ============================================================
-- 026 — SỔ NHẬP KHO VPP: CHO PHÉP DÒNG ĐIỀU CHỈNH GIẢM
--
-- SỬA THIẾU SÓT CỦA 025:
-- 025 đặt `check (qty > 0)` vì hình dung sổ chỉ ghi các lần nhập thêm. Nhưng ô
-- "Số lượng nhập kho" trên giao diện là ô SỬA SỐ TỔNG, không phải ô "nhập thêm":
-- hành chính gõ 50 rồi phát hiện nhầm, sửa lại còn 30 -> chênh lệch là -20.
-- Ràng buộc cũ chặn mất dòng -20 đó, hậu quả là tổng sổ không còn khớp cột
-- `imported` và báo cáo "nhập trong tháng" sai vĩnh viễn từ đó về sau.
--
-- Sau migration này sổ ghi được cả hai chiều:
--   qty > 0  — nhập thêm
--   qty < 0  — điều chỉnh giảm (sửa số gõ nhầm)
-- Vẫn chặn qty = 0 vì dòng không làm thay đổi gì thì không đáng ghi.
--
-- Bất biến cần giữ: tổng qty của một vật tư trong sổ LUÔN bằng
-- `vpp_supplies.imported` của vật tư đó. Câu kiểm tra cuối file đo đúng điều này.
--
-- CÁCH CHẠY: Supabase Dashboard > SQL Editor. An toàn chạy lại nhiều lần.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = 'vpp_stock_entries'
  ) then
    raise exception 'Chưa có bảng vpp_stock_entries — hãy chạy migration 025 trước.';
  end if;
end $$;

-- Gỡ ràng buộc cũ (quét động theo tên do Postgres tự đặt, không đoán tên)
do $$
declare con record;
begin
  for con in
    select conname
    from pg_constraint
    where conrelid = 'public.vpp_stock_entries'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%qty%'
  loop
    execute format('alter table public.vpp_stock_entries drop constraint %I;', con.conname);
    raise notice 'Đã gỡ ràng buộc cũ trên cột qty: %', con.conname;
  end loop;
end $$;

alter table public.vpp_stock_entries
  add constraint vpp_stock_entries_qty_not_zero check (qty <> 0);

comment on column public.vpp_stock_entries.qty is
  'Dương = nhập thêm. Âm = điều chỉnh giảm khi sửa lại số gõ nhầm. Tổng qty theo vật tư luôn bằng vpp_supplies.imported.';

-- ─── KIỂM TRA ───
-- Cột `lech` phải bằng 0 ở mọi dòng.
select s.name,
       s.imported                           as cot_imported,
       coalesce(sum(e.qty), 0)              as tong_so_nhap_kho,
       s.imported - coalesce(sum(e.qty), 0) as lech
from public.vpp_supplies s
left join public.vpp_stock_entries e on e.supply_id = s.id
group by s.id, s.name, s.imported
order by s.name;
