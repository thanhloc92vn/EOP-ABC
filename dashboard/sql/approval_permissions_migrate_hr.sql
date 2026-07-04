-- Chuyển các HR đang hard-code trong code sang bảng approval_permissions
-- (quyền duyệt giải trình chấm công). Chạy sau approval_permissions.sql.

-- 1. Thêm từ bảng employees (lấy đúng email đăng nhập đang lưu)
insert into public.approval_permissions (email, name, can_approve_trip, can_approve_leave, can_approve_justification)
select
  case
    when e.name = 'Lê Thị Hoa Đào' and position('lehoadao2706@gmail.com' in coalesce(e.email, '')) = 0
      then coalesce(e.email, '') || ', lehoadao2706@gmail.com'
    else e.email
  end,
  e.name,
  false, false, true
from public.employees e
where e.name in ('Dương Nhật Hoành Anh', 'Lê Thị Hoa Đào')
  and not exists (
    select 1 from public.approval_permissions p where p.name = e.name
  );

-- 2. Phòng trường hợp chị Hoa Đào không có dòng trong employees
--    (code cũ từng phải nhận diện bằng email gmail riêng)
insert into public.approval_permissions (email, name, can_approve_trip, can_approve_leave, can_approve_justification)
select 'lehoadao2706@gmail.com', 'Lê Thị Hoa Đào', false, false, true
where not exists (
  select 1 from public.approval_permissions where name = 'Lê Thị Hoa Đào'
);

-- Kiểm tra kết quả
select name, email, can_approve_trip, can_approve_leave, can_approve_justification
from public.approval_permissions
order by name;
