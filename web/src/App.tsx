import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { RequireAuth } from "./components/RequireAuth";
import { RequirePermissao } from "./components/RequirePermissao";
import { AppLayout } from "./components/Layout/AppLayout";
import { SomGlobal } from "./components/SomGlobal";

// PERF-01: cada página vira um chunk JS separado, carregado só quando a rota é visitada, em vez
// de tudo (inclusive telas de impressão/relatório raramente abertas) ir junto no bundle inicial —
// era o que gerava o aviso de "chunk > 500kB" em toda build. Exports são nomeados (não default),
// por isso o `.then` adaptando pro formato que `lazy` espera.
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const BI = lazy(() => import("./pages/BI").then((m) => ({ default: m.BI })));
const Usuarios = lazy(() => import("./pages/Usuarios").then((m) => ({ default: m.Usuarios })));
const Equipes = lazy(() => import("./pages/Equipes").then((m) => ({ default: m.Equipes })));
const Ativos = lazy(() => import("./pages/Ativos").then((m) => ({ default: m.Ativos })));
const AtivoDetalhe = lazy(() => import("./pages/AtivoDetalhe").then((m) => ({ default: m.AtivoDetalhe })));
const Pecas = lazy(() => import("./pages/Pecas").then((m) => ({ default: m.Pecas })));
const PecaDetalhe = lazy(() => import("./pages/PecaDetalhe").then((m) => ({ default: m.PecaDetalhe })));
const Planos = lazy(() => import("./pages/Planos").then((m) => ({ default: m.Planos })));
const PlanoDetalhe = lazy(() => import("./pages/PlanoDetalhe").then((m) => ({ default: m.PlanoDetalhe })));
const GerarLote = lazy(() => import("./pages/GerarLote").then((m) => ({ default: m.GerarLote })));
const GerarLoteImprimir = lazy(() => import("./pages/GerarLoteImprimir").then((m) => ({ default: m.GerarLoteImprimir })));
const OrdensServico = lazy(() => import("./pages/OrdensServico").then((m) => ({ default: m.OrdensServico })));
const OrdensServicoCalendario = lazy(() => import("./pages/OrdensServicoCalendario").then((m) => ({ default: m.OrdensServicoCalendario })));
const OrdemServicoDetalhe = lazy(() => import("./pages/OrdemServicoDetalhe").then((m) => ({ default: m.OrdemServicoDetalhe })));
const OrdemServicoImprimir = lazy(() => import("./pages/OrdemServicoImprimir").then((m) => ({ default: m.OrdemServicoImprimir })));
const ServicoExternoImprimir = lazy(() => import("./pages/ServicoExternoImprimir").then((m) => ({ default: m.ServicoExternoImprimir })));
const AtivoHistoricoImprimir = lazy(() => import("./pages/AtivoHistoricoImprimir").then((m) => ({ default: m.AtivoHistoricoImprimir })));
const Almoxarifado = lazy(() => import("./pages/Almoxarifado").then((m) => ({ default: m.Almoxarifado })));
const CurvaABC = lazy(() => import("./pages/CurvaABC").then((m) => ({ default: m.CurvaABC })));
const ImportarEstoque = lazy(() => import("./pages/ImportarEstoque").then((m) => ({ default: m.ImportarEstoque })));
const ProgramacaoCompras = lazy(() => import("./pages/ProgramacaoCompras").then((m) => ({ default: m.ProgramacaoCompras })));
const RequisicaoCompraDetalhe = lazy(() => import("./pages/RequisicaoCompraDetalhe").then((m) => ({ default: m.RequisicaoCompraDetalhe })));
const Solicitacoes = lazy(() => import("./pages/Solicitacoes").then((m) => ({ default: m.Solicitacoes })));
const SolicitacaoDetalhe = lazy(() => import("./pages/SolicitacaoDetalhe").then((m) => ({ default: m.SolicitacaoDetalhe })));
const PontosLubrificacao = lazy(() => import("./pages/PontosLubrificacao").then((m) => ({ default: m.PontosLubrificacao })));
const CalendarioLubrificacao = lazy(() => import("./pages/CalendarioLubrificacao").then((m) => ({ default: m.CalendarioLubrificacao })));
const GerarLoteLubrificacao = lazy(() => import("./pages/GerarLoteLubrificacao").then((m) => ({ default: m.GerarLoteLubrificacao })));
const GerarLoteLubrificacaoImprimir = lazy(() => import("./pages/GerarLoteLubrificacaoImprimir").then((m) => ({ default: m.GerarLoteLubrificacaoImprimir })));
const Inspecoes = lazy(() => import("./pages/Inspecoes").then((m) => ({ default: m.Inspecoes })));
const PlanosInspecao = lazy(() => import("./pages/PlanosInspecao").then((m) => ({ default: m.PlanosInspecao })));
const PlanoInspecaoDetalhe = lazy(() => import("./pages/PlanoInspecaoDetalhe").then((m) => ({ default: m.PlanoInspecaoDetalhe })));
const CalendarioInspecao = lazy(() => import("./pages/CalendarioInspecao").then((m) => ({ default: m.CalendarioInspecao })));
const GerarLoteInspecao = lazy(() => import("./pages/GerarLoteInspecao").then((m) => ({ default: m.GerarLoteInspecao })));
const GerarLoteInspecaoImprimir = lazy(() => import("./pages/GerarLoteInspecaoImprimir").then((m) => ({ default: m.GerarLoteInspecaoImprimir })));
const AuditoriasOS = lazy(() => import("./pages/AuditoriasOS").then((m) => ({ default: m.AuditoriasOS })));
const AuditoriaOSDetalhe = lazy(() => import("./pages/AuditoriaOSDetalhe").then((m) => ({ default: m.AuditoriaOSDetalhe })));
const RelatorioPac1150 = lazy(() => import("./pages/RelatorioPac1150").then((m) => ({ default: m.RelatorioPac1150 })));
const RelatorioPac1150Imprimir = lazy(() => import("./pages/RelatorioPac1150Imprimir").then((m) => ({ default: m.RelatorioPac1150Imprimir })));
const RelatorioOSRealizadas = lazy(() => import("./pages/RelatorioOSRealizadas").then((m) => ({ default: m.RelatorioOSRealizadas })));
const RelatorioOSRealizadasImprimir = lazy(() => import("./pages/RelatorioOSRealizadasImprimir").then((m) => ({ default: m.RelatorioOSRealizadasImprimir })));
const RelatorioPac1149 = lazy(() => import("./pages/RelatorioPac1149").then((m) => ({ default: m.RelatorioPac1149 })));
const RelatorioPac1149Imprimir = lazy(() => import("./pages/RelatorioPac1149Imprimir").then((m) => ({ default: m.RelatorioPac1149Imprimir })));
const CalendarioAnual = lazy(() => import("./pages/CalendarioAnual").then((m) => ({ default: m.CalendarioAnual })));
const Configuracoes = lazy(() => import("./pages/Configuracoes").then((m) => ({ default: m.Configuracoes })));
const Auditoria = lazy(() => import("./pages/Auditoria").then((m) => ({ default: m.Auditoria })));

export default function App() {
  return (
    <AuthProvider>
      <SomGlobal />
      <Suspense
        fallback={
          <div className="login-screen">
            <div style={{ color: "var(--c-n-300)" }}>Carregando…</div>
          </div>
        }
      >
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/ordens-servico/:id/imprimir"
          element={
            <RequireAuth>
              <OrdemServicoImprimir />
            </RequireAuth>
          }
        />

        <Route
          path="/ativos/:id/historico/imprimir"
          element={
            <RequireAuth>
              <AtivoHistoricoImprimir />
            </RequireAuth>
          }
        />

        <Route
          path="/servicos-externos/:id/imprimir"
          element={
            <RequireAuth>
              <ServicoExternoImprimir />
            </RequireAuth>
          }
        />

        <Route
          path="/ordens-servico/gerar-lote/imprimir"
          element={
            <RequireAuth>
              <GerarLoteImprimir />
            </RequireAuth>
          }
        />

        <Route
          path="/lubrificacao/gerar-lote/imprimir"
          element={
            <RequireAuth>
              <GerarLoteLubrificacaoImprimir />
            </RequireAuth>
          }
        />

        <Route
          path="/inspecoes/gerar-lote/imprimir"
          element={
            <RequireAuth>
              <GerarLoteInspecaoImprimir />
            </RequireAuth>
          }
        />

        <Route
          path="/relatorios/pac-1150/imprimir"
          element={
            <RequireAuth>
              <RelatorioPac1150Imprimir />
            </RequireAuth>
          }
        />

        <Route
          path="/relatorios/os-realizadas/imprimir"
          element={
            <RequireAuth>
              <RelatorioOSRealizadasImprimir />
            </RequireAuth>
          }
        />

        <Route
          path="/relatorios/pac-1149/imprimir"
          element={
            <RequireAuth>
              <RelatorioPac1149Imprimir />
            </RequireAuth>
          }
        />

        <Route
          element={
            <RequireAuth>
              <AppLayout />
            </RequireAuth>
          }
        >
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/bi"
            element={
              <RequirePermissao modulo="indicadores">
                <BI />
              </RequirePermissao>
            }
          />

          <Route
            path="/ativos"
            element={
              <RequirePermissao modulo="ativos">
                <Ativos />
              </RequirePermissao>
            }
          />
          <Route
            path="/ativos/:id"
            element={
              <RequirePermissao modulo="ativos">
                <AtivoDetalhe />
              </RequirePermissao>
            }
          />
          <Route
            path="/pecas"
            element={
              <RequirePermissao modulo="pecas">
                <Pecas />
              </RequirePermissao>
            }
          />
          <Route
            path="/pecas/:id"
            element={
              <RequirePermissao modulo="pecas">
                <PecaDetalhe />
              </RequirePermissao>
            }
          />
          <Route
            path="/planos"
            element={
              <RequirePermissao modulo="planos">
                <Planos />
              </RequirePermissao>
            }
          />
          <Route
            path="/planos/:id"
            element={
              <RequirePermissao modulo="planos">
                <PlanoDetalhe />
              </RequirePermissao>
            }
          />
          <Route
            path="/planos/calendario"
            element={
              <RequirePermissao modulo="planos">
                <CalendarioAnual />
              </RequirePermissao>
            }
          />
          <Route
            path="/ordens-servico"
            element={
              <RequirePermissao modulo="ordens_servico">
                <OrdensServico />
              </RequirePermissao>
            }
          />
          <Route
            path="/ordens-servico/calendario"
            element={
              <RequirePermissao modulo="ordens_servico">
                <OrdensServicoCalendario />
              </RequirePermissao>
            }
          />
          <Route
            path="/ordens-servico/gerar-lote"
            element={
              <RequirePermissao modulo="geracao_lote">
                <GerarLote />
              </RequirePermissao>
            }
          />
          <Route
            path="/ordens-servico/:id"
            element={
              <RequirePermissao modulo="ordens_servico">
                <OrdemServicoDetalhe />
              </RequirePermissao>
            }
          />
          <Route
            path="/solicitacoes"
            element={
              <RequirePermissao modulo="solicitacoes">
                <Solicitacoes />
              </RequirePermissao>
            }
          />
          <Route
            path="/solicitacoes/:id"
            element={
              <RequirePermissao modulo="solicitacoes">
                <SolicitacaoDetalhe />
              </RequirePermissao>
            }
          />
          <Route
            path="/lubrificacao/pontos"
            element={
              <RequirePermissao modulo="lubrificacao">
                <PontosLubrificacao />
              </RequirePermissao>
            }
          />
          <Route
            path="/lubrificacao/calendario"
            element={
              <RequirePermissao modulo="lubrificacao">
                <CalendarioLubrificacao />
              </RequirePermissao>
            }
          />
          <Route
            path="/lubrificacao/gerar-lote"
            element={
              <RequirePermissao modulo="lubrificacao">
                <GerarLoteLubrificacao />
              </RequirePermissao>
            }
          />
          <Route
            path="/inspecoes"
            element={
              <RequirePermissao modulo="inspecoes">
                <Inspecoes />
              </RequirePermissao>
            }
          />
          <Route
            path="/inspecoes/planos"
            element={
              <RequirePermissao modulo="inspecoes">
                <PlanosInspecao />
              </RequirePermissao>
            }
          />
          <Route
            path="/inspecoes/planos/:id"
            element={
              <RequirePermissao modulo="inspecoes">
                <PlanoInspecaoDetalhe />
              </RequirePermissao>
            }
          />
          <Route
            path="/inspecoes/calendario"
            element={
              <RequirePermissao modulo="inspecoes">
                <CalendarioInspecao />
              </RequirePermissao>
            }
          />
          <Route
            path="/inspecoes/gerar-lote"
            element={
              <RequirePermissao modulo="inspecoes">
                <GerarLoteInspecao />
              </RequirePermissao>
            }
          />
          <Route
            path="/inspecoes/auditorias"
            element={
              <RequirePermissao modulo="inspecoes">
                <AuditoriasOS />
              </RequirePermissao>
            }
          />
          <Route
            path="/inspecoes/auditorias/:id"
            element={
              <RequirePermissao modulo="inspecoes">
                <AuditoriaOSDetalhe />
              </RequirePermissao>
            }
          />
          <Route
            path="/relatorios/pac-1150"
            element={
              <RequirePermissao modulo="ordens_servico">
                <RelatorioPac1150 />
              </RequirePermissao>
            }
          />
          <Route
            path="/relatorios/os-realizadas"
            element={
              <RequirePermissao modulo="ordens_servico">
                <RelatorioOSRealizadas />
              </RequirePermissao>
            }
          />
          <Route
            path="/relatorios/pac-1149"
            element={
              <RequirePermissao modulo="lubrificacao">
                <RelatorioPac1149 />
              </RequirePermissao>
            }
          />
          <Route
            path="/almoxarifado"
            element={
              <RequirePermissao modulo="almoxarifado">
                <Almoxarifado />
              </RequirePermissao>
            }
          />
          <Route
            path="/almoxarifado/curva-abc"
            element={
              <RequirePermissao modulo="almoxarifado">
                <CurvaABC />
              </RequirePermissao>
            }
          />
          <Route
            path="/almoxarifado/importar-estoque"
            element={
              <RequirePermissao modulo="almoxarifado">
                <ImportarEstoque />
              </RequirePermissao>
            }
          />
          <Route
            path="/programacao-compras"
            element={
              <RequirePermissao modulo="programacao_compras">
                <ProgramacaoCompras />
              </RequirePermissao>
            }
          />
          <Route
            path="/programacao-compras/:id"
            element={
              <RequirePermissao modulo="programacao_compras">
                <RequisicaoCompraDetalhe />
              </RequirePermissao>
            }
          />
          <Route
            path="/usuarios"
            element={
              <RequirePermissao modulo="usuarios">
                <Usuarios />
              </RequirePermissao>
            }
          />
          <Route
            path="/equipes"
            element={
              <RequirePermissao modulo="equipes">
                <Equipes />
              </RequirePermissao>
            }
          />
          <Route
            path="/configuracoes"
            element={
              <RequirePermissao modulo="configuracoes">
                <Configuracoes />
              </RequirePermissao>
            }
          />
          <Route
            path="/auditoria"
            element={
              <RequirePermissao modulo="auditoria">
                <Auditoria />
              </RequirePermissao>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
      </Suspense>
    </AuthProvider>
  );
}
