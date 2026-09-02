-- ============================================================
-- 067_gps_reject_out_of_range.sql — Chấm công NGOÀI VÙNG bị TỪ CHỐI GHI
--
-- Đổi hành vi trigger validate (thay migration 066): thay vì lưu bản ghi với
-- is_valid=false khi ngoài bán kính, nay TỪ CHỐI HẲN việc ghi (RAISE EXCEPTION).
-- Lý do: bản ghi "ngoài vùng" tuy không tính công nhưng vẫn nằm trong DB gây rối
-- ("có ghi nhận thực" không?). Nay ngoài vùng = không chấm được, không bản ghi.
--
-- Từ chối khi: (1) BĐH chưa ghim toạ độ, (2) GPS rác accuracy>100m, (3) ngoài
-- bán kính. Mọi dòng ghi thành công đều is_valid=true.
--
-- CÁCH CHẠY: Supabase SQL Editor > dán > Run. An toàn chạy lại nhiều lần.
-- ============================================================

create or replace function public.gps_checkins_validate()
returns trigger language plpgsql as $$
declare
  pl record;
  d  double precision;
begin
  -- Giờ chính thức = giờ server, bỏ qua giá trị client gửi.
  new.captured_at := now();

  select lat, lng, coalesce(radius_m, 50) as radius_m
    into pl
  from public.project_locations
  where bdh_name = new.bdh_name
  limit 1;

  -- (1) BĐH chưa định vị -> không đủ căn cứ.
  if not found then
    raise exception 'BĐH "%" chưa được ghim toạ độ. Liên hệ Admin định vị trước khi chấm công.', new.bdh_name
      using errcode = 'check_violation';
  end if;

  -- (2) Định vị rác (wifi/IP giả) -> chặn.
  if new.accuracy_m is not null and new.accuracy_m > 100 then
    raise exception 'Tín hiệu GPS quá yếu (sai số ~% m). Ra chỗ thoáng và thử lại.', round(new.accuracy_m)
      using errcode = 'check_violation';
  end if;

  -- (3) Ngoài bán kính -> chặn hẳn, KHÔNG ghi nhận.
  d := public.gps_distance_m(new.lat, new.lng, pl.lat, pl.lng);
  if d > pl.radius_m then
    raise exception 'Ngoài bán kính cho phép: cách vị trí BĐH ~% m (bán kính % m). Không thể chấm công.', round(d), pl.radius_m
      using errcode = 'check_violation';
  end if;

  -- Hợp lệ -> ghi nhận.
  new.radius_m   := pl.radius_m;
  new.distance_m := d;
  new.is_valid   := true;
  return new;
end;
$$;

-- Dọn các bản ghi ngoài vùng cũ (is_valid=false) — dữ liệu thử nghiệm, không tính
-- công. Sau bước này mọi dòng trong gps_checkins đều hợp lệ.
-- (Ảnh minh chứng của các dòng này, nếu có, gỡ tay trong Storage > gps-checkins.)
delete from public.gps_checkins where is_valid = false;

-- Kiểm tra: phải không còn dòng is_valid=false.
select count(*) as con_lai_ngoai_vung from public.gps_checkins where is_valid = false;
