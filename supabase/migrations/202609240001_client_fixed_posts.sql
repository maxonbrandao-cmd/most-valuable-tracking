-- Executar uma vez no SQL Editor do Supabase.
begin;

create or replace function public.list_my_fixed_posts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_client_id uuid;
begin
  select p.company_id, p.client_id into v_company_id, v_client_id
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.active and p.role = 'cliente';

  if v_company_id is null or v_client_id is null then
    raise exception 'Acesso disponível apenas para um cliente ativo e vinculado.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', f.id, 'name', f.name, 'weekdays', f.weekdays,
      'start_date', f.start_date, 'end_date', f.end_date,
      'start_time', f.start_time, 'end_time', f.end_time, 'active', f.active,
      'drivers', coalesce((
        select jsonb_agg(jsonb_build_object('id', names.driver_id, 'name', names.name)
          order by names.name, names.driver_id)
        from (
          select distinct a.driver_id, coalesce(d.name, 'Piloto não encontrado') as name
          from public.fixed_post_assignments a
          left join public.drivers d on d.id = a.driver_id and d.company_id = v_company_id
          where a.fixed_post_id = f.id and a.company_id = v_company_id and a.active
        ) names
      ), '[]'::jsonb)
    ) order by f.name, f.id)
    from public.fixed_posts f
    where f.company_id = v_company_id and f.client_id = v_client_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.list_my_fixed_posts() from public, anon;
grant execute on function public.list_my_fixed_posts() to authenticated;

commit;
