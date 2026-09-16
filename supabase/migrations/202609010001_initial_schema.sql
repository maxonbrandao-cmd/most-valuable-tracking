-- Most Valuable Tracking
-- Fundação Supabase multiempresa: operação, GPS, canhotos e financeiro.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create type public.user_role as enum ('dono', 'cliente', 'piloto');
create type public.driver_status as enum ('disponivel', 'em_rota', 'offline', 'inativo');
create type public.delivery_status as enum (
  'pendente',
  'aceito',
  'coletado',
  'em_rota',
  'chegou',
  'entregue',
  'nao_entregue',
  'cancelado'
);
create type public.transaction_type as enum ('receita', 'despesa');
create type public.transaction_status as enum ('pendente', 'pago', 'cancelado');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  document text,
  phone text,
  timezone text not null default 'America/Sao_Paulo',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index companies_document_uidx
  on public.companies (document)
  where document is not null;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  company_name text,
  document text,
  email text,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create unique index clients_company_document_uidx
  on public.clients (company_id, document)
  where document is not null;

create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  phone text,
  document text,
  plate text,
  vehicle_description text,
  status public.driver_status not null default 'offline',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);

create unique index drivers_company_document_uidx
  on public.drivers (company_id, document)
  where document is not null;

create unique index drivers_company_plate_uidx
  on public.drivers (company_id, plate)
  where plate is not null;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  role public.user_role not null,
  full_name text not null,
  phone text,
  client_id uuid,
  driver_id uuid,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_client_company_fk
    foreign key (company_id, client_id)
    references public.clients(company_id, id)
    on delete restrict,
  constraint profiles_driver_company_fk
    foreign key (company_id, driver_id)
    references public.drivers(company_id, id)
    on delete restrict,
  constraint profiles_role_link_check check (
    (role = 'dono' and client_id is null and driver_id is null)
    or (role = 'cliente' and client_id is not null and driver_id is null)
    or (role = 'piloto' and client_id is null and driver_id is not null)
  )
);

create index profiles_client_user_idx
  on public.profiles (client_id)
  where client_id is not null;

create unique index profiles_driver_user_uidx
  on public.profiles (driver_id)
  where driver_id is not null;

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  code text not null default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  client_id uuid not null,
  driver_id uuid,
  origin_address text not null,
  origin_lat double precision check (origin_lat between -90 and 90),
  origin_lng double precision check (origin_lng between -180 and 180),
  destination_address text not null,
  destination_lat double precision check (destination_lat between -90 and 90),
  destination_lng double precision check (destination_lng between -180 and 180),
  recipient_name text,
  recipient_phone text,
  notes text,
  value numeric(12, 2) not null default 0 check (value >= 0),
  driver_payout numeric(12, 2) not null default 0 check (driver_payout >= 0),
  status public.delivery_status not null default 'pendente',
  tracking_token uuid not null default gen_random_uuid(),
  scheduled_at timestamptz,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint deliveries_client_company_fk
    foreign key (company_id, client_id)
    references public.clients(company_id, id)
    on delete restrict,
  constraint deliveries_driver_company_fk
    foreign key (company_id, driver_id)
    references public.drivers(company_id, id)
    on delete restrict,
  unique (company_id, id),
  unique (company_id, code),
  unique (tracking_token)
);

create index deliveries_company_status_idx on public.deliveries (company_id, status);
create index deliveries_client_created_idx on public.deliveries (client_id, created_at desc);
create index deliveries_driver_status_idx on public.deliveries (driver_id, status);

create table public.delivery_status_history (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  delivery_id uuid not null,
  status public.delivery_status not null,
  note text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint delivery_status_history_delivery_company_fk
    foreign key (company_id, delivery_id)
    references public.deliveries(company_id, id)
    on delete cascade
);

create index delivery_status_history_delivery_created_idx
  on public.delivery_status_history (delivery_id, created_at desc);

create table public.gps_positions (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_id uuid not null,
  delivery_id uuid,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision check (accuracy_m is null or accuracy_m >= 0),
  speed_kmh double precision check (speed_kmh is null or speed_kmh >= 0),
  heading double precision check (heading is null or heading between 0 and 360),
  battery_percent smallint check (battery_percent is null or battery_percent between 0 and 100),
  recorded_at timestamptz not null,
  received_at timestamptz not null default now(),
  constraint gps_positions_driver_company_fk
    foreign key (company_id, driver_id)
    references public.drivers(company_id, id)
    on delete cascade,
  constraint gps_positions_delivery_company_fk
    foreign key (company_id, delivery_id)
    references public.deliveries(company_id, id)
    on delete cascade
);

create index gps_positions_driver_recorded_idx
  on public.gps_positions (driver_id, recorded_at desc);
create index gps_positions_delivery_recorded_idx
  on public.gps_positions (delivery_id, recorded_at desc)
  where delivery_id is not null;

create table public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delivery_id uuid not null,
  receiver_name text not null,
  receiver_document text,
  notes text,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  canhoto_photo_path text,
  package_photo_path text,
  signature_path text,
  delivered_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint delivery_proofs_delivery_company_fk
    foreign key (company_id, delivery_id)
    references public.deliveries(company_id, id)
    on delete cascade,
  unique (delivery_id)
);

create table public.financial_transactions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  delivery_id uuid,
  type public.transaction_type not null,
  status public.transaction_status not null default 'pago',
  source text not null default 'manual' check (source in ('manual', 'delivery')),
  category text not null,
  description text not null,
  amount numeric(12, 2) not null check (amount > 0),
  transaction_date date not null default current_date,
  due_date date,
  paid_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint financial_transactions_delivery_company_fk
    foreign key (company_id, delivery_id)
    references public.deliveries(company_id, id)
    on delete restrict
);

create unique index financial_delivery_revenue_uidx
  on public.financial_transactions (delivery_id)
  where source = 'delivery' and type = 'receita';

create index financial_company_date_idx
  on public.financial_transactions (company_id, transaction_date desc);

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger companies_touch_updated_at
before update on public.companies
for each row execute function private.touch_updated_at();

create trigger clients_touch_updated_at
before update on public.clients
for each row execute function private.touch_updated_at();

create trigger drivers_touch_updated_at
before update on public.drivers
for each row execute function private.touch_updated_at();

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();

create trigger deliveries_touch_updated_at
before update on public.deliveries
for each row execute function private.touch_updated_at();

create trigger financial_transactions_touch_updated_at
before update on public.financial_transactions
for each row execute function private.touch_updated_at();

create or replace function private.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.company_id
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.active;
$$;

create or replace function private.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.active;
$$;

create or replace function private.current_client_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.client_id
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.active;
$$;

create or replace function private.current_driver_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.driver_id
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.active;
$$;

create or replace function private.is_company_owner(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.company_id = p_company_id
      and p.role = 'dono'
      and p.active
  );
$$;

create or replace function private.can_access_delivery(p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deliveries d
    join public.profiles p on p.user_id = (select auth.uid())
    where d.id = p_delivery_id
      and d.company_id = p.company_id
      and p.active
      and (
        p.role = 'dono'
        or (p.role = 'cliente' and d.client_id = p.client_id)
        or (p.role = 'piloto' and d.driver_id = p.driver_id)
      )
  );
$$;

create or replace function private.can_manage_delivery(p_delivery_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.deliveries d
    join public.profiles p on p.user_id = (select auth.uid())
    where d.id = p_delivery_id
      and d.company_id = p.company_id
      and p.active
      and (p.role = 'dono' or (p.role = 'piloto' and d.driver_id = p.driver_id))
  );
$$;

create or replace function private.can_access_client(p_company_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.company_id = p_company_id
      and p.active
      and (
        p.role = 'dono'
        or (p.role = 'cliente' and p.client_id = p_client_id)
        or (
          p.role = 'piloto'
          and exists (
            select 1 from public.deliveries d
            where d.company_id = p_company_id
              and d.client_id = p_client_id
              and d.driver_id = p.driver_id
          )
        )
      )
  );
$$;

create or replace function private.can_access_driver(p_company_id uuid, p_driver_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = (select auth.uid())
      and p.company_id = p_company_id
      and p.active
      and (
        p.role = 'dono'
        or (p.role = 'piloto' and p.driver_id = p_driver_id)
        or (
          p.role = 'cliente'
          and exists (
            select 1 from public.deliveries d
            where d.company_id = p_company_id
              and d.client_id = p.client_id
              and d.driver_id = p_driver_id
          )
        )
      )
  );
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

create or replace function private.log_delivery_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.delivery_status_history (
      company_id,
      delivery_id,
      status,
      created_by
    ) values (
      new.company_id,
      new.id,
      new.status,
      coalesce(new.updated_by, new.created_by, (select auth.uid()))
    );
  end if;
  return new;
end;
$$;

create trigger deliveries_log_status
after insert or update of status on public.deliveries
for each row execute function private.log_delivery_status();

create or replace function private.finish_delivery_from_proof()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
begin
  update public.deliveries
  set status = 'entregue',
      delivered_at = new.delivered_at,
      completed_at = new.delivered_at,
      updated_by = new.created_by
  where id = new.delivery_id
  returning * into v_delivery;

  insert into public.financial_transactions (
    company_id,
    delivery_id,
    type,
    status,
    source,
    category,
    description,
    amount,
    transaction_date,
    paid_at,
    created_by
  ) values (
    new.company_id,
    new.delivery_id,
    'receita',
    'pago',
    'delivery',
    'Entrega',
    'Entrega ' || v_delivery.code,
    v_delivery.value,
    new.delivered_at::date,
    new.delivered_at,
    new.created_by
  )
  on conflict (delivery_id) where source = 'delivery' and type = 'receita'
  do nothing;

  return new;
end;
$$;

revoke all on function private.log_delivery_status() from public;
revoke all on function private.finish_delivery_from_proof() from public;

create trigger delivery_proofs_finish_delivery
after insert on public.delivery_proofs
for each row execute function private.finish_delivery_from_proof();

alter table public.companies enable row level security;
alter table public.clients enable row level security;
alter table public.drivers enable row level security;
alter table public.profiles enable row level security;
alter table public.deliveries enable row level security;
alter table public.delivery_status_history enable row level security;
alter table public.gps_positions enable row level security;
alter table public.delivery_proofs enable row level security;
alter table public.financial_transactions enable row level security;

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;
revoke all on all sequences in schema public from anon;

grant select, update on public.companies to authenticated;
grant select, insert, update, delete on public.clients to authenticated;
grant select, insert, update, delete on public.drivers to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on public.deliveries to authenticated;
grant select on public.delivery_status_history to authenticated;
grant select on public.gps_positions to authenticated;
grant select, delete on public.delivery_proofs to authenticated;
grant select, insert, update, delete on public.financial_transactions to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create policy companies_select_same_company
on public.companies for select to authenticated
using (id = (select private.current_company_id()));

create policy companies_update_owner
on public.companies for update to authenticated
using ((select private.is_company_owner(id)))
with check ((select private.is_company_owner(id)));

create policy profiles_select_self_or_owner
on public.profiles for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_company_owner(company_id))
);

create policy profiles_update_owner
on public.profiles for update to authenticated
using ((select private.is_company_owner(company_id)))
with check ((select private.is_company_owner(company_id)));

create policy clients_select_authorized
on public.clients for select to authenticated
using ((select private.can_access_client(company_id, id)));

create policy clients_insert_owner
on public.clients for insert to authenticated
with check ((select private.is_company_owner(company_id)));

create policy clients_update_owner
on public.clients for update to authenticated
using ((select private.is_company_owner(company_id)))
with check ((select private.is_company_owner(company_id)));

create policy clients_delete_owner
on public.clients for delete to authenticated
using ((select private.is_company_owner(company_id)));

create policy drivers_select_authorized
on public.drivers for select to authenticated
using ((select private.can_access_driver(company_id, id)));

create policy drivers_insert_owner
on public.drivers for insert to authenticated
with check ((select private.is_company_owner(company_id)));

create policy drivers_update_owner
on public.drivers for update to authenticated
using ((select private.is_company_owner(company_id)))
with check ((select private.is_company_owner(company_id)));

create policy drivers_delete_owner
on public.drivers for delete to authenticated
using ((select private.is_company_owner(company_id)));

create policy deliveries_select_authorized
on public.deliveries for select to authenticated
using ((select private.can_access_delivery(id)));

create policy deliveries_insert_owner
on public.deliveries for insert to authenticated
with check ((select private.is_company_owner(company_id)));

create policy deliveries_update_owner
on public.deliveries for update to authenticated
using ((select private.is_company_owner(company_id)))
with check ((select private.is_company_owner(company_id)));

create policy deliveries_delete_owner
on public.deliveries for delete to authenticated
using ((select private.is_company_owner(company_id)));

create policy delivery_status_history_select_authorized
on public.delivery_status_history for select to authenticated
using ((select private.can_access_delivery(delivery_id)));

create policy gps_positions_select_authorized
on public.gps_positions for select to authenticated
using (
  (select private.is_company_owner(company_id))
  or driver_id = (select private.current_driver_id())
  or (delivery_id is not null and (select private.can_access_delivery(delivery_id)))
);

create policy delivery_proofs_select_authorized
on public.delivery_proofs for select to authenticated
using ((select private.can_access_delivery(delivery_id)));

create policy delivery_proofs_delete_owner
on public.delivery_proofs for delete to authenticated
using ((select private.is_company_owner(company_id)));

create policy financial_transactions_owner_all
on public.financial_transactions for all to authenticated
using ((select private.is_company_owner(company_id)))
with check ((select private.is_company_owner(company_id)));

create or replace function public.create_company(
  p_name text,
  p_owner_full_name text,
  p_document text default null,
  p_phone text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_company_id uuid;
begin
  if v_user_id is null then
    raise exception 'Autenticação obrigatória';
  end if;

  if exists (select 1 from public.profiles where user_id = v_user_id) then
    raise exception 'O usuário já pertence a uma empresa';
  end if;

  insert into public.companies (name, document, phone)
  values (trim(p_name), nullif(trim(p_document), ''), nullif(trim(p_phone), ''))
  returning id into v_company_id;

  insert into public.profiles (user_id, company_id, role, full_name, phone)
  values (v_user_id, v_company_id, 'dono', trim(p_owner_full_name), nullif(trim(p_phone), ''));

  return v_company_id;
end;
$$;

create or replace function public.add_company_profile(
  p_user_id uuid,
  p_full_name text,
  p_role public.user_role,
  p_client_id uuid default null,
  p_driver_id uuid default null,
  p_phone text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.current_company_id());
  v_profile public.profiles%rowtype;
begin
  if not (select private.is_company_owner(v_company_id)) then
    raise exception 'Somente proprietários podem vincular usuários';
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuário não encontrado no Supabase Auth';
  end if;

  insert into public.profiles (
    user_id,
    company_id,
    role,
    full_name,
    phone,
    client_id,
    driver_id
  ) values (
    p_user_id,
    v_company_id,
    p_role,
    trim(p_full_name),
    nullif(trim(p_phone), ''),
    p_client_id,
    p_driver_id
  )
  returning * into v_profile;

  return v_profile;
end;
$$;

create or replace function public.set_delivery_status(
  p_delivery_id uuid,
  p_status public.delivery_status
)
returns public.deliveries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_role public.user_role := (select private.current_user_role());
begin
  if not (select private.can_manage_delivery(p_delivery_id)) then
    raise exception 'Sem permissão para alterar esta entrega';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if v_role = 'piloto' and not (
    (v_delivery.status = 'pendente' and p_status in ('aceito', 'coletado'))
    or (v_delivery.status = 'aceito' and p_status in ('coletado', 'cancelado'))
    or (v_delivery.status = 'coletado' and p_status in ('em_rota', 'cancelado'))
    or (v_delivery.status = 'em_rota' and p_status in ('chegou', 'entregue', 'nao_entregue'))
    or (v_delivery.status = 'chegou' and p_status in ('entregue', 'nao_entregue'))
    or (v_delivery.status = 'nao_entregue' and p_status = 'em_rota')
    or v_delivery.status = p_status
  ) then
    raise exception 'Transição de status não permitida para o piloto';
  end if;

  update public.deliveries
  set status = p_status,
      accepted_at = case when p_status = 'aceito' then coalesce(accepted_at, now()) else accepted_at end,
      picked_up_at = case when p_status = 'coletado' then coalesce(picked_up_at, now()) else picked_up_at end,
      delivered_at = case when p_status = 'entregue' then coalesce(delivered_at, now()) else null end,
      completed_at = case when p_status in ('entregue', 'nao_entregue', 'cancelado') then coalesce(completed_at, now()) else null end,
      updated_by = (select auth.uid())
  where id = p_delivery_id
  returning * into v_delivery;

  return v_delivery;
end;
$$;

create or replace function public.register_gps_position(
  p_lat double precision,
  p_lng double precision,
  p_recorded_at timestamptz,
  p_delivery_id uuid default null,
  p_accuracy_m double precision default null,
  p_speed_kmh double precision default null,
  p_heading double precision default null,
  p_battery_percent smallint default null
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.current_company_id());
  v_driver_id uuid := (select private.current_driver_id());
  v_id bigint;
begin
  if (select private.current_user_role()) <> 'piloto' or v_driver_id is null then
    raise exception 'Somente um piloto autenticado pode registrar GPS';
  end if;

  if p_delivery_id is not null and not exists (
    select 1 from public.deliveries d
    where d.id = p_delivery_id
      and d.company_id = v_company_id
      and d.driver_id = v_driver_id
  ) then
    raise exception 'Entrega não atribuída a este piloto';
  end if;

  insert into public.gps_positions (
    company_id,
    driver_id,
    delivery_id,
    lat,
    lng,
    accuracy_m,
    speed_kmh,
    heading,
    battery_percent,
    recorded_at
  ) values (
    v_company_id,
    v_driver_id,
    p_delivery_id,
    p_lat,
    p_lng,
    p_accuracy_m,
    p_speed_kmh,
    p_heading,
    p_battery_percent,
    p_recorded_at
  ) returning id into v_id;

  update public.drivers
  set status = 'em_rota'
  where id = v_driver_id and company_id = v_company_id;

  return v_id;
end;
$$;

create or replace function public.register_delivery_proof(
  p_delivery_id uuid,
  p_receiver_name text,
  p_receiver_document text default null,
  p_notes text default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_canhoto_photo_path text default null,
  p_package_photo_path text default null,
  p_signature_path text default null,
  p_delivered_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid := (select private.current_company_id());
  v_id uuid;
begin
  if not (select private.can_manage_delivery(p_delivery_id)) then
    raise exception 'Sem permissão para registrar o comprovante';
  end if;

  insert into public.delivery_proofs (
    company_id,
    delivery_id,
    receiver_name,
    receiver_document,
    notes,
    lat,
    lng,
    canhoto_photo_path,
    package_photo_path,
    signature_path,
    delivered_at,
    created_by
  ) values (
    v_company_id,
    p_delivery_id,
    trim(p_receiver_name),
    nullif(trim(p_receiver_document), ''),
    nullif(trim(p_notes), ''),
    p_lat,
    p_lng,
    p_canhoto_photo_path,
    p_package_photo_path,
    p_signature_path,
    p_delivered_at,
    (select auth.uid())
  ) returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_company(text, text, text, text) from public;
revoke all on function public.add_company_profile(uuid, text, public.user_role, uuid, uuid, text) from public;
revoke all on function public.set_delivery_status(uuid, public.delivery_status) from public;
revoke all on function public.register_gps_position(double precision, double precision, timestamptz, uuid, double precision, double precision, double precision, smallint) from public;
revoke all on function public.register_delivery_proof(uuid, text, text, text, double precision, double precision, text, text, text, timestamptz) from public;

grant execute on function public.create_company(text, text, text, text) to authenticated;
grant execute on function public.add_company_profile(uuid, text, public.user_role, uuid, uuid, text) to authenticated;
grant execute on function public.set_delivery_status(uuid, public.delivery_status) to authenticated;
grant execute on function public.register_gps_position(double precision, double precision, timestamptz, uuid, double precision, double precision, double precision, smallint) to authenticated;
grant execute on function public.register_delivery_proof(uuid, text, text, text, double precision, double precision, text, text, text, timestamptz) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'delivery-proofs',
  'delivery-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function private.proof_path_delivery_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  if coalesce(array_length(v_parts, 1), 0) < 3 then
    return null;
  end if;
  return v_parts[2]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

create or replace function private.proof_path_company_id(p_name text)
returns uuid
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
begin
  if coalesce(array_length(v_parts, 1), 0) < 3 then
    return null;
  end if;
  return v_parts[1]::uuid;
exception when invalid_text_representation then
  return null;
end;
$$;

revoke all on function private.proof_path_delivery_id(text) from public;
revoke all on function private.proof_path_company_id(text) from public;
grant execute on function private.proof_path_delivery_id(text) to authenticated;
grant execute on function private.proof_path_company_id(text) to authenticated;

create policy delivery_proof_files_select
on storage.objects for select to authenticated
using (
  bucket_id = 'delivery-proofs'
  and (select private.proof_path_company_id(name)) = (select private.current_company_id())
  and (select private.can_access_delivery(private.proof_path_delivery_id(name)))
);

create policy delivery_proof_files_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'delivery-proofs'
  and (select private.proof_path_company_id(name)) = (select private.current_company_id())
  and (select private.can_manage_delivery(private.proof_path_delivery_id(name)))
);

create policy delivery_proof_files_update
on storage.objects for update to authenticated
using (
  bucket_id = 'delivery-proofs'
  and (select private.can_manage_delivery(private.proof_path_delivery_id(name)))
)
with check (
  bucket_id = 'delivery-proofs'
  and (select private.proof_path_company_id(name)) = (select private.current_company_id())
  and (select private.can_manage_delivery(private.proof_path_delivery_id(name)))
);

create policy delivery_proof_files_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'delivery-proofs'
  and (select private.proof_path_company_id(name)) = (select private.current_company_id())
  and (select private.is_company_owner(private.proof_path_company_id(name)))
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'deliveries'
  ) then
    alter publication supabase_realtime add table public.deliveries;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gps_positions'
  ) then
    alter publication supabase_realtime add table public.gps_positions;
  end if;
end;
$$;
