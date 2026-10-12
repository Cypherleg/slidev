// Edge Function `jornada-paciente` (página do paciente, sem login: token do link no corpo).
import { criarServico } from '../_deno/inicializar.ts'

Deno.serve(criarServico('paciente'))
