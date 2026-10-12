// Edge Function `jornada-cirurgica` (ações da equipe). verify_jwt = false: a autenticação é feita
// no handler via GET {SUPABASE_URL}/auth/v1/user (padrão do painel de pré-consulta).
import { criarServico } from '../_deno/inicializar.ts'

Deno.serve(criarServico('equipe'))
