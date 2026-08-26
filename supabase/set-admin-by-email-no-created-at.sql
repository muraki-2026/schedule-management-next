update user_profiles
set role = '管理者', active = true
where email = 'your-email@example.com';

select id, name, email, role, active
from user_profiles
order by email;
