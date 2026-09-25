begin;
alter table public.deliveries add column if not exists started_at timestamptz;

-- Iniciar uma recorrente não altera status para aceito nem preenche accepted_at.
create or replace function public.start_recurring_delivery(p_delivery_id uuid)
returns public.deliveries language plpgsql security definer set search_path = '' as $$
declare v public.deliveries%rowtype;
begin
  select d.* into v from public.deliveries d
  join public.profiles p on p.user_id = (select auth.uid())
    and p.active and p.role = 'piloto' and p.company_id = d.company_id and p.driver_id = d.driver_id
  where d.id = p_delivery_id for update of d;
  if not found then raise exception 'Corrida não disponível para este piloto.' using errcode = '42501'; end if;
  if v.schedule_id is null or v.status <> 'pendente' then
    raise exception 'Esta corrida não pode ser iniciada por esta ação.';
  end if;
  if v.started_at is null then
    update public.deliveries set started_at = now(), updated_by = (select auth.uid())
    where id = v.id returning * into v;
  end if;
  return v;
end;
$$;
revoke all on function public.start_recurring_delivery(uuid) from public, anon;
grant execute on function public.start_recurring_delivery(uuid) to authenticated;

-- Protege também chamadas de versões antigas do aplicativo.
create or replace function private.guard_recurring_delivery_acceptance()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.schedule_id is not null then
    if new.status = 'aceito' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
      raise exception 'Corridas recorrentes não exigem aceite. Use Iniciar atendimento.';
    end if;
    if tg_op = 'UPDATE' and old.status = 'pendente' and new.status = 'coletado'
      and new.started_at is null then
      raise exception 'Inicie o atendimento antes de confirmar a coleta.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_recurring_delivery_acceptance on public.deliveries;
create trigger guard_recurring_delivery_acceptance before insert or update on public.deliveries
for each row execute function private.guard_recurring_delivery_acceptance();

create table if not exists public.fixed_post_attendances (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  fixed_post_id uuid not null references public.fixed_posts(id),
  driver_id uuid not null references public.drivers(id),
  service_date date not null,
  checked_in_at timestamptz not null default now(),
  checked_out_at timestamptz,
  check (checked_out_at is null or checked_out_at >= checked_in_at),
  unique(company_id, fixed_post_id, driver_id, service_date)
);
create unique index if not exists one_open_fixed_post_attendance
on public.fixed_post_attendances(company_id, driver_id) where checked_out_at is null;
alter table public.fixed_post_attendances enable row level security;
revoke all on public.fixed_post_attendances from anon, authenticated;

create or replace function public.record_my_fixed_post_attendance(p_post_id uuid, p_action text)
returns public.fixed_post_attendances language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid; v_driver uuid; v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v public.fixed_post_attendances%rowtype;
begin
  select company_id, driver_id into v_company, v_driver from public.profiles
  where user_id = (select auth.uid()) and active and role = 'piloto';
  if v_company is null or v_driver is null then raise exception 'Piloto não vinculado.' using errcode = '42501'; end if;
  -- Serializa cliques simultâneos do mesmo piloto.
  perform pg_advisory_xact_lock(hashtextextended(v_company::text || v_driver::text, 0));
  if p_action = 'check_out' then
    select * into v from public.fixed_post_attendances
    where company_id = v_company and driver_id = v_driver and fixed_post_id = p_post_id
    order by checked_in_at desc limit 1 for update;
    if not found then raise exception 'Não há check-in para encerrar neste posto.'; end if;
    if v.checked_out_at is null then
      update public.fixed_post_attendances set checked_out_at = now() where id = v.id returning * into v;
    end if;
    return v;
  elsif p_action <> 'check_in' or p_action is null then
    raise exception 'Ação inválida.';
  end if;
  -- Repetir a mesma solicitação não cria outro atendimento.
  select * into v from public.fixed_post_attendances where company_id = v_company
    and driver_id = v_driver and fixed_post_id = p_post_id and service_date = v_today;
  if found then return v; end if;
  if not exists (
    select 1 from public.fixed_posts f join public.fixed_post_assignments a
      on a.fixed_post_id = f.id and a.company_id = f.company_id
    where f.id = p_post_id and f.company_id = v_company and f.active and a.active
      and a.driver_id = v_driver and v_today >= f.start_date and v_today >= a.start_date
      and (f.end_date is null or v_today <= f.end_date)
      and (a.end_date is null or v_today <= a.end_date)
      and extract(isodow from v_today)::integer = any(f.weekdays)
  ) then raise exception 'Você não tem alocação ativa neste posto para hoje.'; end if;
  if exists(select 1 from public.fixed_post_attendances where company_id = v_company
    and driver_id = v_driver and checked_out_at is null) then
    raise exception 'Encerre o atendimento em aberto antes de iniciar outro.';
  end if;
  insert into public.fixed_post_attendances(company_id, fixed_post_id, driver_id, service_date)
  values(v_company, p_post_id, v_driver, v_today) returning * into v;
  return v;
end;
$$;
revoke all on function public.record_my_fixed_post_attendance(uuid,text) from public, anon;
grant execute on function public.record_my_fixed_post_attendance(uuid,text) to authenticated;

create or replace function public.list_my_fixed_post_attendances()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_company uuid; v_driver uuid;
begin
  select company_id, driver_id into v_company, v_driver from public.profiles
  where user_id = (select auth.uid()) and active and role = 'piloto';
  if v_company is null or v_driver is null then raise exception 'Piloto não vinculado.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(to_jsonb(r) order by r.checked_in_at desc) from (
    select a.id, a.fixed_post_id, f.name as post_name, a.service_date, a.checked_in_at, a.checked_out_at
    from public.fixed_post_attendances a join public.fixed_posts f on f.id = a.fixed_post_id and f.company_id = a.company_id
    where a.company_id = v_company and a.driver_id = v_driver
      and (a.checked_out_at is null or a.checked_in_at >= now() - interval '30 days')
  ) r), '[]'::jsonb);
end;
$$;
revoke all on function public.list_my_fixed_post_attendances() from public, anon;
grant execute on function public.list_my_fixed_post_attendances() to authenticated;
commit;
