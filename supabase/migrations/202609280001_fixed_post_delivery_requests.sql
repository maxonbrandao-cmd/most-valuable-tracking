begin;

alter table public.fixed_posts
  add column if not exists origin_address text;

alter table public.deliveries
  add column if not exists fixed_post_id uuid references public.fixed_posts(id) on delete set null;

create index if not exists deliveries_fixed_post_created_idx
  on public.deliveries (fixed_post_id, created_at desc)
  where fixed_post_id is not null;

create or replace function public.request_fixed_post_delivery(
  p_fixed_post_id uuid,
  p_origin_address text,
  p_origin_postal_code text,
  p_destination_address text,
  p_destination_postal_code text,
  p_recipient_name text default null,
  p_recipient_phone text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_id uuid;
  v_client_id uuid;
  v_delivery_id uuid;
  v_profile record;
  v_post record;
  v_origin_cep text := nullif(regexp_replace(coalesce(p_origin_postal_code, ''), '[^0-9]', '', 'g'), '');
  v_destination_cep text := nullif(regexp_replace(coalesce(p_destination_postal_code, ''), '[^0-9]', '', 'g'), '');
begin
  select p.company_id, p.client_id into v_company_id, v_client_id
  from public.profiles p
  where p.user_id = (select auth.uid()) and p.active and p.role = 'cliente';

  if v_company_id is null or v_client_id is null then
    raise exception 'Acesso disponível apenas para um cliente ativo e vinculado.' using errcode = '42501';
  end if;

  select f.company_id, f.client_id, f.active into v_post
  from public.fixed_posts f
  where f.id = p_fixed_post_id;

  if not found or v_post.company_id <> v_company_id or v_post.client_id <> v_client_id or not v_post.active then
    raise exception 'Posto fixo não encontrado ou inativo.' using errcode = '42501';
  end if;

  if nullif(trim(coalesce(p_origin_address, '')), '') is null
    or nullif(trim(coalesce(p_destination_address, '')), '') is null then
    raise exception 'Informe os endereços de coleta e entrega.' using errcode = '22023';
  end if;
  if (v_origin_cep is not null and length(v_origin_cep) <> 8)
    or (v_destination_cep is not null and length(v_destination_cep) <> 8) then
    raise exception 'Informe CEPs com oito dígitos.' using errcode = '22023';
  end if;

  insert into public.deliveries (
    company_id, client_id, fixed_post_id, origin_address, origin_postal_code,
    destination_address, destination_postal_code, recipient_name, recipient_phone,
    notes, driver_id, status, created_by
  ) values (
    v_company_id, v_client_id, p_fixed_post_id, trim(p_origin_address), v_origin_cep,
    trim(p_destination_address), v_destination_cep, nullif(trim(coalesce(p_recipient_name, '')), ''),
    nullif(trim(coalesce(p_recipient_phone, '')), ''), nullif(trim(coalesce(p_notes, '')), ''),
    null, 'pendente', (select auth.uid())
  ) returning id into v_delivery_id;

  return v_delivery_id;
end;
$$;

revoke all on function public.request_fixed_post_delivery(uuid, text, text, text, text, text, text, text) from public, anon;
grant execute on function public.request_fixed_post_delivery(uuid, text, text, text, text, text, text, text) to authenticated;

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
      'origin_address', f.origin_address,
      'drivers', coalesce((
        select jsonb_agg(jsonb_build_object('id', names.driver_id, 'name', names.name)
          order by names.name, names.driver_id)
        from (
          select distinct a.driver_id, coalesce(d.name, 'Piloto não encontrado') as name
          from public.fixed_post_assignments a
          left join public.drivers d on d.id = a.driver_id and d.company_id = v_company_id
          where a.fixed_post_id = f.id and a.company_id = v_company_id and a.active
        ) names
      ), '[]'::jsonb),
      'requests', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', d.id, 'code', d.code, 'status', d.status,
          'driver_name', dr.name, 'created_at', d.created_at
        ) order by d.created_at desc)
        from public.deliveries d
        left join public.drivers dr on dr.id = d.driver_id and dr.company_id = v_company_id
        where d.fixed_post_id = f.id and d.company_id = v_company_id and d.client_id = v_client_id
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

