# Configuração do Supabase

Esta etapa cria a fundação compartilhada do Most Valuable Tracking. Ela ainda não substitui o `localStorage` do protótipo; a conexão das telas será feita na etapa seguinte.

## 1. Criar o projeto

1. Acesse o painel do Supabase e crie um projeto.
2. Escolha a região mais próxima da operação.
3. Guarde a senha do banco em um gerenciador de senhas.

## 2. Aplicar a migração

### Opção rápida — SQL Editor

Abra o **SQL Editor** do Supabase, copie todo o conteúdo de:

`supabase/migrations/202609010001_initial_schema.sql`

Execute o script uma única vez.

### Opção recomendada para desenvolvimento contínuo — CLI

Com a Supabase CLI instalada e o projeto vinculado:

```bash
supabase init
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Execute `supabase init` somente se ainda não existir `supabase/config.toml`.

Não execute a mesma migração manualmente no SQL Editor e depois novamente pelo CLI no mesmo banco.

## 3. Configurar as variáveis do frontend

Copie `.env.example` para `.env.local` e preencha:

```env
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_SUBSTITUA_AQUI
```

Use somente a **Publishable key** no React. Nunca coloque uma Secret key ou a antiga `service_role` em arquivos do frontend.

## 4. Instalar o cliente JavaScript

Na próxima etapa, quando conectarmos a autenticação e as telas:

```bash
npm install @supabase/supabase-js
```

Esse comando atualizará também o `package-lock.json` no Windows.

## 5. Criar o primeiro proprietário

1. No painel do Supabase, abra **Authentication > Users**.
2. Crie o usuário do proprietário e copie o UUID dele.
3. No SQL Editor, substitua os valores do exemplo abaixo e execute uma vez:

```sql
with nova_empresa as (
  insert into public.companies (name, document, phone)
  values ('Minha Transportadora', null, null)
  returning id
)
insert into public.profiles (user_id, company_id, role, full_name)
select
  'UUID_DO_USUARIO_AUTH'::uuid,
  id,
  'dono'::public.user_role,
  'Nome do proprietário'
from nova_empresa;
```

Depois que o login real estiver conectado, novas empresas poderão ser abertas pela função segura `create_company`, sem SQL manual.

## 6. O que a migração configura

- empresas, perfis, clientes e pilotos;
- entregas e histórico de status;
- posições GPS com registro de precisão, velocidade e bateria;
- comprovantes de entrega;
- receitas e despesas;
- RLS para separar empresas e perfis;
- bucket privado `delivery-proofs` para fotos e assinaturas;
- Realtime para `deliveries` e `gps_positions`;
- funções seguras para criar empresa, mudar status, registrar GPS e registrar comprovante.

Os arquivos do canhoto devem seguir este caminho dentro do bucket:

```text
COMPANY_ID/DELIVERY_ID/nome-do-arquivo.jpg
```

Nesta primeira versão, o Realtime usa **Postgres Changes**, adequado para validar o MVP. Antes de uma operação com muitos pilotos e alta frequência de GPS, avaliaremos a migração dos eventos ao vivo para **Broadcast** e uma política de retenção do histórico.

## 7. Verificações após a execução

No Supabase, confirme:

1. As tabelas aparecem no **Table Editor**.
2. O bucket privado `delivery-proofs` aparece em **Storage**.
3. `deliveries` e `gps_positions` aparecem na publicação `supabase_realtime`.
4. O **Security Advisor** não informa tabelas públicas sem RLS.

Para gerar os tipos TypeScript diretamente do banco após a migração:

```bash
supabase gen types typescript --linked > src/lib/database.types.ts
```
