begin;
alter table public.financial_transactions add column if not exists local_import_key text;
create unique index if not exists financial_local_import_uidx
on public.financial_transactions(company_id, local_import_key) where local_import_key is not null;

create table if not exists public.financial_categories (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  name text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(company_id, name)
);
create unique index if not exists financial_category_name_uidx
on public.financial_categories(company_id, lower(trim(name)));
alter table public.financial_categories enable row level security;
revoke all on public.financial_categories from anon, authenticated;
grant select on public.financial_categories to authenticated;
drop policy if exists financial_categories_owner_read on public.financial_categories;
create policy financial_categories_owner_read on public.financial_categories for select to authenticated
using ((select private.is_company_owner(company_id)));

create or replace function public.prepare_financial_catalog()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  select company_id into v_company from public.profiles where user_id = (select auth.uid()) and active and role = 'dono';
  if v_company is null then raise exception 'Acesso restrito ao responsável da empresa.' using errcode = '42501'; end if;
  if not exists(select 1 from public.financial_categories where company_id = v_company) then
  insert into public.financial_categories(company_id, name)
  select v_company, name from (values ('Entrega'), ('Combustível'), ('Manutenção'), ('Salário'), ('Outros')) defaults(name)
  on conflict do nothing;
  end if;
  insert into public.financial_categories(company_id, name)
  select distinct v_company, trim(category) from public.financial_transactions
  where company_id = v_company and length(trim(category)) between 1 and 80 on conflict do nothing;
  return jsonb_build_object(
    'categories', coalesce((select jsonb_agg(to_jsonb(c) order by c.name) from public.financial_categories c where company_id = v_company), '[]'::jsonb),
    'imported', coalesce((select jsonb_agg(local_import_key) from public.financial_transactions where company_id = v_company and local_import_key is not null), '[]'::jsonb)
  );
end;
$$;

create or replace function public.save_financial_category(p_name text, p_id uuid default null, p_active boolean default true, p_expected timestamptz default null)
returns public.financial_categories language plpgsql security definer set search_path = '' as $$
declare v_company uuid; v_old public.financial_categories%rowtype; v_result public.financial_categories%rowtype;
begin
  select company_id into v_company from public.profiles where user_id = (select auth.uid()) and active and role = 'dono';
  if v_company is null then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if p_name is null or length(trim(p_name)) not between 1 and 80 or p_active is null then raise exception 'Informe uma categoria com até 80 caracteres.'; end if;
  if p_id is null then
    insert into public.financial_categories(company_id, name, active) values(v_company, trim(p_name), p_active) returning * into v_result;
  else
    select * into v_old from public.financial_categories where id = p_id and company_id = v_company for update;
    if not found then raise exception 'Categoria não encontrada.'; end if;
    if p_expected is distinct from v_old.updated_at then raise exception 'Categoria alterada em outra sessão. Atualize a tela.'; end if;
    update public.financial_categories set name = trim(p_name), active = p_active, updated_at = clock_timestamp()
    where id = p_id returning * into v_result;
    if v_old.name <> v_result.name then
      update public.financial_transactions set category = v_result.name where company_id = v_company and category = v_old.name;
    end if;
  end if;
  return v_result;
end;
$$;

create or replace function public.save_financial_entry(p_entry jsonb, p_id uuid default null, p_expected timestamptz default null)
returns public.financial_transactions language plpgsql security definer set search_path = '' as $$
declare
  v_company uuid; v_old public.financial_transactions%rowtype; v_result public.financial_transactions%rowtype;
  v_category public.financial_categories%rowtype; v_amount numeric;
  v_type public.transaction_type; v_status public.transaction_status;
  v_import text := nullif(p_entry->>'local_import_key', '');
begin
  select company_id into v_company from public.profiles where user_id = (select auth.uid()) and active and role = 'dono';
  if v_company is null then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  v_amount := (p_entry->>'amount')::numeric;
  v_type := (p_entry->>'type')::public.transaction_type;
  v_status := (p_entry->>'status')::public.transaction_status;
  if v_amount is null or v_amount <= 0 or v_amount > 9999999999.99 or v_amount::text in ('NaN','Infinity')
    or round(v_amount, 2) <> v_amount then raise exception 'Informe um valor positivo com até duas casas decimais.'; end if;
  if v_type is null or v_status is null or nullif(trim(p_entry->>'description'), '') is null
    or nullif(p_entry->>'transaction_date', '') is null then raise exception 'Preencha tipo, status, descrição e data.'; end if;
  if p_id is not null then
    select * into v_old from public.financial_transactions where id = p_id and company_id = v_company for update;
    if not found then raise exception 'Lançamento não encontrado.'; end if;
    if p_expected is distinct from v_old.updated_at then raise exception 'Lançamento alterado em outra sessão. Atualize a tela antes de editar.'; end if;
    if v_old.source = 'delivery' and v_type <> v_old.type then raise exception 'A receita gerada por entrega deve permanecer do tipo Receita.'; end if;
  end if;
  select * into v_category from public.financial_categories where company_id = v_company and name = p_entry->>'category' for share;
  if not found or (not v_category.active and (p_id is null or v_old.category <> v_category.name)) then raise exception 'Selecione uma categoria ativa.'; end if;
  if p_id is null then
    insert into public.financial_transactions(company_id, type, status, source, category, description, amount, transaction_date, due_date, paid_at, local_import_key)
    values(v_company, v_type, v_status, 'manual', v_category.name, trim(p_entry->>'description'), v_amount,
      (p_entry->>'transaction_date')::date, nullif(p_entry->>'due_date','')::date,
      case when v_status = 'pago' then now() else null end, v_import)
    on conflict (company_id, local_import_key) where local_import_key is not null do nothing returning * into v_result;
    if v_result.id is null then raise exception 'Este registro local já foi importado. Atualize a tela.'; end if;
  else
    update public.financial_transactions set type = v_type, status = v_status, category = v_category.name,
      description = trim(p_entry->>'description'), amount = v_amount, transaction_date = (p_entry->>'transaction_date')::date,
      due_date = nullif(p_entry->>'due_date','')::date,
      paid_at = case when v_status = 'pago' then coalesce(paid_at, now()) else null end
    where id = p_id returning * into v_result;
  end if;
  return v_result;
end;
$$;

revoke all on function public.prepare_financial_catalog() from public, anon;
revoke all on function public.save_financial_category(text,uuid,boolean,timestamptz) from public, anon;
revoke all on function public.save_financial_entry(jsonb,uuid,timestamptz) from public, anon;
grant execute on function public.prepare_financial_catalog() to authenticated;
grant execute on function public.save_financial_category(text,uuid,boolean,timestamptz) to authenticated;
grant execute on function public.save_financial_entry(jsonb,uuid,timestamptz) to authenticated;
commit;
