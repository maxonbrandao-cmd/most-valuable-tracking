-- Corridas programadas: apenas o dono cria ou altera a programação.
create table public.delivery_schedules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  client_id uuid not null,
  name text not null check (char_length(trim(name)) >= 2),
  origin_address text not null,
  origin_postal_code text,
  destination_address text not null,
  destination_postal_code text,
  default_driver_id uuid,
  value numeric(12,2) not null default 0 check (value >= 0),
  driver_payout numeric(12,2) not null default 0 check (driver_payout >= 0),
  notes text,
  weekdays smallint[] not null check (cardinality(weekdays) > 0),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  scheduled_time time not null,
  runs_per_day integer not null default 1 check (runs_per_day between 1 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint delivery_schedules_client_company_fk foreign key (company_id, client_id) references public.clients(company_id, id),
  constraint delivery_schedules_driver_company_fk foreign key (company_id, default_driver_id) references public.drivers(company_id, id),
  check (weekdays <@ array[1,2,3,4,5,6,7]::smallint[])
);

alter table public.deliveries
  add column if not exists schedule_id uuid references public.delivery_schedules(id) on delete set null,
  add column if not exists schedule_date date,
  add column if not exists schedule_run integer,
  add column if not exists schedule_is_override boolean not null default false;

create unique index deliveries_schedule_occurrence_uidx
  on public.deliveries(schedule_id, schedule_date, schedule_run)
  where schedule_id is not null;
create index delivery_schedules_company_active_idx on public.delivery_schedules(company_id, active, start_date);

create trigger delivery_schedules_touch_updated_at
before update on public.delivery_schedules
for each row execute function private.touch_updated_at();

alter table public.delivery_schedules enable row level security;
revoke all on public.delivery_schedules from anon, authenticated;
grant select, insert, update, delete on public.delivery_schedules to authenticated;

create policy delivery_schedules_owner_only
on public.delivery_schedules for all to authenticated
using ((select private.is_company_owner(company_id)))
with check ((select private.is_company_owner(company_id)));

create or replace function public.generate_schedule_deliveries(p_schedule_id uuid, p_from_date date default current_date)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.delivery_schedules%rowtype;
  v_created integer := 0;
  v_date date;
  v_run integer;
begin
  select * into s from public.delivery_schedules where id = p_schedule_id;
  if not found then raise exception 'Programação não encontrada'; end if;
  if not (select private.is_company_owner(s.company_id)) then raise exception 'Somente o dono pode gerar corridas programadas'; end if;
  if not s.active then return 0; end if;

  for v_date in select d::date from generate_series(greatest(s.start_date, p_from_date), s.end_date, interval '1 day') d
  loop
    if extract(isodow from v_date)::smallint = any(s.weekdays) then
      for v_run in 1..s.runs_per_day loop
        insert into public.deliveries (
          company_id, client_id, driver_id, origin_address, origin_postal_code,
          destination_address, destination_postal_code, value, driver_payout,
          notes, status, scheduled_at, schedule_id, schedule_date, schedule_run
        ) values (
          s.company_id, s.client_id, s.default_driver_id, s.origin_address, s.origin_postal_code,
          s.destination_address, s.destination_postal_code, s.value, s.driver_payout,
          s.notes, 'pendente', (v_date + s.scheduled_time) at time zone 'America/Sao_Paulo', s.id, v_date, v_run
        ) on conflict (schedule_id, schedule_date, schedule_run) do nothing;
        if found then v_created := v_created + 1; end if;
      end loop;
    end if;
  end loop;
  return v_created;
end;
$$;

revoke all on function public.generate_schedule_deliveries(uuid, date) from public;
grant execute on function public.generate_schedule_deliveries(uuid, date) to authenticated;

