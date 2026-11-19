/**
 * O sindicato dono da ferramenta.
 *
 * `contato` nasce `null` **de propósito**: é o único valor de espera deste ciclo. A tela
 * encaminha o professor ao sindicato em dois lugares (o pedido de restituição no e-CAC e a
 * divergência de leitura), e sem um canal real ela o deixa sem endereço. Trocar por e-mail
 * ou pela página do Sinpro-ABC **antes de o app ir ao ar**; enquanto for `null`, a tela diz
 * "procure o Sinpro-ABC" sem prometer um canal.
 */
export const SINDICATO: { nome: string; contato: string | null } = {
  nome: 'Sinpro-ABC',
  contato: null,
};
