-- MVT: CEP das entregas e cadastro de empresa restrito ao servidor.

alter table public.deliveries
  add column if not exists origin_postal_code text,
  add column if not exists destination_postal_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_origin_postal_code_check'
  ) then
    alter table public.deliveries
      add constraint deliveries_origin_postal_code_check
      check (origin_postal_code is null or origin_postal_code ~ '^[0-9]{8}$');
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'deliveries_destination_postal_code_check'
  ) then
    alter table public.deliveries
      add constraint deliveries_destination_postal_code_check
      check (destination_postal_code is null or destination_postal_code ~ '^[0-9]{8}$');
  end if;
end;
$$;

-- Esta função recebe explicitamente o UUID do usuário criado no Supabase Auth.
-- Somente o SQL Editor (postgres) e o backend com service_role podem executá-la.
create or replace function public.admin_create_company(
  p_owner_user_id uuid,
  p_company_name text,
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
  v_company_id uuid;
begin
  if p_owner_user_id is null then
    raise exception 'Informe o UUID do proprietário';
  end if;

  if char_length(trim(coalesce(p_company_name, ''))) < 2 then
    raise exception 'Nome da empresa inválido';
  end if;

  if char_length(trim(coalesce(p_owner_full_name, ''))) < 2 then
    raise exception 'Nome do proprietário inválido';
  end if;

  if not exists (select 1 from auth.users where id = p_owner_user_id) then
    raise exception 'Usuário não encontrado no Supabase Auth';
  end if;

  if exists (select 1 from public.profiles where user_id = p_owner_user_id) then
    raise exception 'Este usuário já pertence a uma empresa';
  end if;

  insert into public.companies (name, document, phone)
  values (
    trim(p_company_name),
    nullif(regexp_replace(coalesce(p_document, ''), '[^0-9]', '', 'g'), ''),
    nullif(trim(coalesce(p_phone, '')), '')
  )
  returning id into v_company_id;

  insert into public.profiles (user_id, company_id, role, full_name, phone)
  values (
    p_owner_user_id,
    v_company_id,
    'dono',
    trim(p_owner_full_name),
    nullif(trim(coalesce(p_phone, '')), '')
  );

  return v_company_id;
end;
$$;

revoke all on function public.admin_create_company(uuid, text, text, text, text) from public;
revoke all on function public.admin_create_company(uuid, text, text, text, text) from anon;
revoke all on function public.admin_create_company(uuid, text, text, text, text) from authenticated;
grant execute on function public.admin_create_company(uuid, text, text, text, text) to service_role;

-- Impede que o antigo fluxo de auto-cadastro de empresa seja usado pelo app.
revoke execute on function public.create_company(text, text, text, text) from authenticated;
revoke execute on function public.add_company_profile(uuid, text, public.user_role, uuid, uuid, text) from authenticated;

