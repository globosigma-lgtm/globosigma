export function Placeholder({ titulo, fase }: { titulo: string; fase: string }) {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{titulo}</h1>
          <div className="page-header__desc">Módulo ainda não construído</div>
        </div>
      </div>
      <div className="card empty-state">
        <h3>Previsto para a {fase}</h3>
        <p>
          Este módulo faz parte do roadmap do Globosigma (Seção 15 do escopo) e ainda não foi implementado.
          O menu já reflete a estrutura final do sistema para orientar o desenvolvimento das próximas fases.
        </p>
      </div>
    </div>
  );
}
