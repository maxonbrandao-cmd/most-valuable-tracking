-- Executar uma vez. Requer fixed_post_attendances do pacote de check-in/check-out.
begin;
create or replace function public.list_company_fixed_post_attendances(p_date date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid;
begin
  select p.company_id into v_company from public.profiles p
  where p.user_id = (select auth.uid()) and p.active and p.role = 'dono';
  if v_company is null then
    raise exception 'Consulta disponível apenas para o responsável ativo da empresa.' using errcode = '42501';
  end if;
  if p_date is null then raise exception 'Informe a data do atendimento.'; end if;
  return coalesce((
    select jsonb_agg(to_jsonb(r) order by r.checked_in_at desc, r.id) from (
      select a.id, a.fixed_post_id, f.name as post_name, a.driver_id,
        coalesce(d.name, 'Piloto não encontrado') as driver_name,
        coalesce(nullif(c.company_name, ''), c.name, 'Cliente não encontrado') as client_name,
        a.service_date, a.checked_in_at, a.checked_out_at
      from public.fixed_post_attendances a
      join public.fixed_posts f on f.id = a.fixed_post_id and f.company_id = v_company
      left join public.drivers d on d.id = a.driver_id and d.company_id = v_company
      left join public.clients c on c.id = f.client_id and c.company_id = v_company
      where a.company_id = v_company and a.service_date = p_date
    ) r
  ), '[]'::jsonb);
end;
$$;
revoke all on function public.list_company_fixed_post_attendances(date) from public, anon;
grant execute on function public.list_company_fixed_post_attendances(date) to authenticated;
commit;
