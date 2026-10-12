# Jornada Cirúrgica · OFTA VITTA

Painel web que acompanha cada cirurgia de catarata do dia dos exames (D-7) até a alta e executa em software o POP de segurança do paciente: paciente certo, olho certo, lente certa, paciente preparado e família informada.

O painel coleta, confere, bloqueia quando falta algo e avisa quem decide. **Não decide conduta clínica.**

> Estado: código e testes locais com dados fictícios. Nenhum recurso em nuvem foi criado, nenhuma migração foi aplicada e o envio a pacientes está desligado (`ENVIO_PACIENTES_HABILITADO=false`). Ver `docs/PLANO.md`.

## Documentos

- `docs/PLANO.md` — plano, fases, riscos, perguntas e o que depende de aprovação.
- `docs/ARQUITETURA.md` — arquitetura, banco, papéis, contrato técnico.
- `docs/DECISOES.md` — decisões e interpretações a confirmar.
- `docs/ROTEIRO-DEMO.md` — demonstração com dados fictícios.
- `docs/notas-agentes/` — notas de cada módulo.
- `docs/privado/` — POP e briefing (fora do git; o repositório é público).

## Rodar localmente (dados fictícios)

Requisitos: Node 22, Postgres 16 (binários em `/usr/lib/postgresql/*/bin`).

```bash
npm ci
npm run pg:iniciar     # Postgres local em 127.0.0.1:54329
npm run dev            # API local (8787) + interface (5173)
npm test               # domínio, banco, API e componentes
npm run test:e2e       # ponta a ponta (Playwright)
```

## Estrutura

```
supabase/functions/_shared/dominio/   regras do POP (TypeScript puro)
supabase/functions/_shared/api/       API (handler, autenticação, repositório, Datasigh, fila)
supabase/functions/jornada-*/         pontos de entrada das Edge Functions
supabase/migrations/                  schema jornada_cirurgica
web/                                  interface (React + Vite)
dev/                                  servidor local de demonstração
tests/                                testes
```
