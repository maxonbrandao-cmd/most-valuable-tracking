-- Execute uma vez no SQL Editor do Supabase do projeto.
begin;
create or replace function public.list_my_driver_fixed_posts()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_driver_id uuid;
begin
  select p.company_id, p.driver_id into v_company_id, v_driver_id
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.active and p.role = 'piloto';

  if v_company_id is null or v_driver_id is null then
    raise exception 'Acesso disponível apenas para um piloto ativo e vinculado.' using errcode = '42501';
  end if;

  return coalesce((
    select jsonb_agg(to_jsonb(post) order by post.name, post.start_date, post.id)
    from (
      select distinct f.id, f.name, f.weekdays, f.start_time, f.end_time, f.active,
        a.start_date, a.end_date,
        coalesce(nullif(c.company_name, ''), c.name, 'Cliente não encontrado') as client_name
      from public.fixed_post_assignments a
      join public.fixed_posts f on f.id = a.fixed_post_id and f.company_id = v_company_id
      left join public.clients c on c.id = f.client_id and c.company_id = v_company_id
      where a.company_id = v_company_id and a.driver_id = v_driver_id and a.active
    ) post
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_my_driver_fixed_posts() from public, anon;
grant execute on function public.list_my_driver_fixed_posts() to authenticated;
commit;
