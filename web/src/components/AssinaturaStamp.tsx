/**
 * Selo de assinatura digital — mesmo layout usado em produção no GloboPac (componente
 * AssinaturaStamp em DocumentDossier.jsx), com a marca d'água trocada para a logo do GloboSigma.
 * Aparece tanto na tela de detalhe da OS quanto no comprovante impresso.
 */
function resumoHash(hash: string | null | undefined, tamanho = 20): string {
  if (!hash) return "—";
  return hash.slice(0, tamanho).toUpperCase();
}

export function AssinaturaStamp({
  titulo,
  nome,
  dataHora,
  hash,
}: {
  titulo: string;
  nome: string;
  dataHora: string;
  hash?: string | null;
}) {
  return (
    <div className="assinatura-stamp">
      <div className="assinatura-stamp__marca-dagua" aria-hidden="true">
        <img src="/logo-sigma-os.png" alt="" />
      </div>
      <div className="assinatura-stamp__conteudo">
        <p className="assinatura-stamp__titulo">{titulo}</p>
        <p className="assinatura-stamp__nome">{nome}</p>
        <p className="assinatura-stamp__data">{dataHora}</p>
        <p className="assinatura-stamp__sistema">Sistema GloboSigma</p>
        <p className="assinatura-stamp__hash">SHA-256: {resumoHash(hash)}</p>
        <p className="assinatura-stamp__legal">Lei 14.063/2020 · Art. 4º §2º</p>
      </div>
    </div>
  );
}
