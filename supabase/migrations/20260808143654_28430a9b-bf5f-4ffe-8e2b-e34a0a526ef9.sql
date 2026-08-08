grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.has_any_role(uuid) to authenticated;
grant execute on function public.is_manager(uuid) to authenticated;
grant execute on function public.can_access_area(uuid, uuid) to authenticated;
grant execute on function public.employee_area_on(uuid, date) to authenticated;
grant execute on function public.employee_shift_on(uuid, date) to authenticated;
do $$
begin
  if to_regprocedure('public.employee_definitive_area_on(uuid, date)') is not null then
    execute 'grant execute on function public.employee_definitive_area_on(uuid, date) to authenticated';
  end if;
  if to_regprocedure('public.employee_definitive_shift_on(uuid, date)') is not null then
    execute 'grant execute on function public.employee_definitive_shift_on(uuid, date) to authenticated';
  end if;
end $$;