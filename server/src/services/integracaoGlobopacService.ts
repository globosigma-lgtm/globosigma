export interface ItemChecklistGlobopac {
  descricao: string;
  obrigatoria: boolean;
}

export interface DadosAtualizacaoOSGlobopac {
  sigma_os_codigo: string;
  sigma_responsavel_nome: string | null;
  sigma_data_programada: string;
  sigma_data_limite: string;
  sigma_descricao_servico: string;
  sigma_checklist: ItemChecklistGlobopac[];
  sigma_checklist_execucao: string;
}

/**
 * Avisa o GloboPac sobre uma atualização de status da OS que nasceu de uma solicitação dele
 * (manutencao_os): programação (conversão da solicitação em OS), execução concluída (pedido de
 * validação in loco) ou conclusão. Mesmo endpoint e mesmo formato de corpo para os três eventos — o
 * GloboPac decide o que fazer com o sigma_os_codigo/datas recebidos. `sigma_descricao_servico` e
 * `sigma_checklist` vão em todo evento (não só na programação) para que o usuário que abriu a
 * solicitação sempre veja, no próprio painel do GloboPac, a descrição do serviço e os itens do
 * checklist definidos na conversão — mesma informação que o Sigma mostra na tela da OS.
 * `sigma_checklist_execucao` é o mesmo checklist já formatado como texto livre, item a item, com o
 * que foi de fato verificado/feito até o momento do evento (ver `checklistExecucaoParaGlobopac` em
 * osService.ts) — na programação ainda sai "não verificado" para tudo, pois a execução não começou.
 * Sempre lança em caso de falha (config ausente, rede, resposta não-ok) — cabe a cada chamador
 * decidir se é best-effort (programação/conclusão, que só logam) ou se a notificação É o propósito
 * da ação e o erro deve ser reportado ao usuário (aviso de execução, ver avisarGlobopacExecucaoOS).
 */
export async function notificarGlobopacAtualizacaoOS(
  manutencaoOsId: string,
  dados: DadosAtualizacaoOSGlobopac
): Promise<void> {
  const url = process.env.GLOBOPAC_CALLBACK_URL;
  const token = process.env.GLOBOPAC_CALLBACK_TOKEN;
  if (!url || !token) {
    throw new Error("GLOBOPAC_CALLBACK_URL/GLOBOPAC_CALLBACK_TOKEN não configurados.");
  }

  const resposta = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Integracao-Token": token,
    },
    body: JSON.stringify({ manutencao_os_id: manutencaoOsId, ...dados }),
  });

  if (!resposta.ok) {
    throw new Error(`GloboPac respondeu ${resposta.status} ao receber a atualização da OS ${dados.sigma_os_codigo}.`);
  }
}
