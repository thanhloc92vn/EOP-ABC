-- ============================================================
-- 068_gps_radius_100.sql — Tăng bán kính chấm công GPS: 50m -> 100m
--
-- Gồm 3 việc: (1) cập nhật dữ liệu các BĐH đang để 50m; (2) đổi mặc định cột cho
-- BĐH tạo mới; (3) đổi fallback 50 -> 100 trong trigger validate (giữ nguyên
-- logic TỪ CHỐI GHI khi ngoài vùng của 067).
--
-- Lưu ý: ngưỡng accuracy (>100m = GPS rác) là ĐỘ CHÍNH XÁC GPS, KHÁC bán kính —
-- giữ nguyên 100m, không đụng.
--
-- CÁCH CHẠY: Supabase SQL Editor > dán > Run. An toàn chạy lại nhiều lần.
-- ============================================================

-- (2) Mặc định cho BĐH tạo mới.
alter table public.project_locations alter column radius_m set default 100;

-- (1) Cập nhật các BĐH hiện đang 50m (hoặc chưa đặt) lên 100m.
--     WHERE giữ lại giá trị tuỳ chỉnh khác nếu sau này có (không đè bừa).
update public.project_locations
set radius_m = 100
where radius_m = 50 or radius_m is null;

-- (3) Đổi fallback 50 -> 100 trong trigger (giữ nguyên logic 067).
create or replace function public.gps_checkins_validate()
returns trigger language plpgsql as $$
declare pl record; d double precision;
begin
  new.captured_at := now();
  select lat, lng, coalesce(radius_m, 100) as radius_m into pl
  from public.project_locations where bdh_name = new.bdh_name limit 1;
  if not found then
    raise exception 'BĐH "%" chưa được ghim toạ độ.', new.bdh_name using errcode='check_violation';
  end if;
  if new.accuracy_m is not null and new.accuracy_m > 100 then
    raise exception 'Tín hiệu GPS quá yếu (sai số ~% m).', round(new.accuracy_m) using errcode='check_violation';
  end if;
  d := public.gps_distance_m(new.lat, new.lng, pl.lat, pl.lng);
  if d > pl.radius_m then
    raise exception 'Ngoài bán kính: cách BĐH ~% m (bán kính % m).', round(d), pl.radius_m using errcode='check_violation';
  end if;
  new.radius_m := pl.radius_m; new.distance_m := d; new.is_valid := true;
  return new;
end;
$$;

-- Kiểm tra: tất cả BĐH phải là 100.
select bdh_name, radius_m from public.project_locations order by bdh_name;
