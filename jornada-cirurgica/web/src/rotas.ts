// Rotas da interface. Os dois agentes de interface usam estas constantes.
export const ROTAS = {
  entrar: '/entrar',
  inicio: '/',
  novoEpisodio: '/novo',
  episodio: (id: string, aba?: 'd7' | 'lente' | 'd2' | 'd0' | 'historico') => `/episodio/${id}${aba ? `?aba=${aba}` : ''}`,
  dia: (data: string) => `/dia/${data}`,
  sala: (episodioId: string) => `/sala/${episodioId}`,
  pendencias: '/pendencias',
  vespera: (data: string) => `/vespera/${data}`,
  gestao: (secao?: 'membros' | 'modelos' | 'materiais' | 'config' | 'indicadores' | 'mensagens') => `/gestao${secao ? `/${secao}` : ''}`,
  impressaoEpisodio: (id: string) => `/impressao/episodio/${id}`,
  impressaoBranco: (modelo: string) => `/impressao/branco/${modelo}`,
  paginaPaciente: (token: string) => `/p/${token}`,
} as const

// Padrões para o roteador (react-router v7).
export const PADROES = {
  entrar: '/entrar',
  inicio: '/',
  novoEpisodio: '/novo',
  episodio: '/episodio/:id',
  dia: '/dia/:data',
  sala: '/sala/:id',
  pendencias: '/pendencias',
  vespera: '/vespera/:data',
  gestao: '/gestao/*',
  impressaoEpisodio: '/impressao/episodio/:id',
  impressaoBranco: '/impressao/branco/:modelo',
  paginaPaciente: '/p/:token',
} as const
