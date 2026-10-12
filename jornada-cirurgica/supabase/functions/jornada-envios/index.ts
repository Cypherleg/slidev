// Edge Function `jornada-envios`: processa a fila de saída. Chamada por agendador (cron) com o
// cabeçalho `x-jornada-envios: <JORNADA_SEGREDO_ENVIOS>`. Sem ENVIO_PACIENTES_HABILITADO=true
// nada sai (modo ensaio). Responde só contagens, nunca conteúdo.
import { criarClienteMeta, ErroConfig, processarFila, textosIguaisTempoConstante } from '../_shared/api/index.ts'
import { ambiente, logger, respostaIndisponivel } from '../_deno/inicializar.ts'

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response(null, { status: 405 })
  let cfg
  try {
    cfg = ambiente()
  } catch (e) {
    logger.erro('configuracao', { funcao: 'envios', variaveis: e instanceof ErroConfig ? e.variaveis.join(',') : 'erro_inesperado' })
    return respostaIndisponivel()
  }
  const segredo = cfg.config.segredoEnvios
  const recebido = req.headers.get('x-jornada-envios') ?? ''
  if (!segredo || segredo.length < 32 || !textosIguaisTempoConstante(recebido, segredo)) return new Response(null, { status: 401 })
  try {
    const r = await processarFila({
      db: cfg.db,
      config: cfg.config,
      meta: cfg.config.meta ? criarClienteMeta(cfg.config.meta) : null,
      logger,
    })
    return new Response(JSON.stringify({ ok: true, dados: r }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } })
  } catch {
    logger.erro('fila', { resultado: 'falha_geral' })
    return respostaIndisponivel()
  }
})
