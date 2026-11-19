insert into public.projects
  (user_id, name, accent_color, sort_order, total_days,
   hours_planned_per_day, hours_available_per_day, started_at)
select id, 'Left on purpose by a check', '#9A7B4F', 999, 1, 1, 1, current_date
from auth.users
order by created_at
limit 1;
