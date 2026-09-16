# Most Valuable Tracking — contexto do projeto

## Objetivo

Plataforma multiempresa para operações de motofrete, com painel web para a transportadora e seus clientes, aplicativo do piloto, rastreamento, comprovantes digitais de entrega e controle financeiro.

## Decisões atuais

- **Painel da empresa e portal do cliente:** React + TypeScript + Vite.
- **Aplicativo do piloto:** será separado em React Native + Expo quando iniciarmos o GPS em segundo plano.
- **Backend compartilhado:** Supabase (PostgreSQL, Auth, Storage e Realtime).
- **Mapa:** Leaflet + OpenStreetMap no protótipo.
- **Multiempresa:** toda informação operacional pertence a uma `company_id` desde a primeira migração.
- **Segurança:** autenticação pelo Supabase Auth e autorização no banco com Row Level Security (RLS).

## Estado recebido em 01/09/2026

O projeto é um protótipo web funcional com três perfis de demonstração (`dono`, `cliente` e `piloto`). Entregas, posições, canhotos e lançamentos financeiros são salvos no `localStorage` do navegador. Portanto, os dados ainda não são compartilhados entre aparelhos.

## Ordem de implementação

1. Fundação Supabase e modelo multiempresa.
2. Autenticação real e substituição gradual do `localStorage`.
3. Cadastros operacionais e entregas compartilhadas.
4. Storage de canhotos, fotos e assinaturas.
5. Realtime para status e posições.
6. Aplicativo Expo do piloto e GPS em segundo plano.
7. Portal público de acompanhamento por token.
8. Financeiro, faturamento e relatórios.

## Regra de transição

Enquanto a integração do frontend não estiver completa, o modo de demonstração local deve continuar funcionando. A troca para Supabase será feita por módulo, mantendo o projeto executável a cada etapa.

