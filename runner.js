import { createBrowser } from "./utils/browser.js";
import loginFlow from "./flows/login.flow.js";
import { uploadScreenshot } from "./services/s3.services.js";
import { sendMessage, sendMetrics, sendExecutionLog, sendHeartbeatIfDue } from "./services/slack.services.js";
import assinaturaFreeFlow from "./flows/AssinaturaFree.flow.js";
//import assinaturaPagaFlow from "./flows/AssinaturaPaga.flow.js";
import modalPagamentoFlow from "./flows/ModalPagamento.flow.js";
import modalCompletarCadastroFlow from "./flows/ModalCompletarCadastro.flow.js";
import uploadMidiaFlow from "./flows/UploadMidia.flow.js";
import chamadaUmParaUmFlow from "./flows/ChamadaUmParaUm.flow.js";
import publicarMidia25xFlow from "./flows/PublicarMidia25x.flow.js";
import fs from "fs";

const SCREENSHOTS_DIR = "screenshots";
const SCREENSHOTS_ERROR_DIR = "screenshots/errors";
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(SCREENSHOTS_ERROR_DIR, { recursive: true });

// Flows automáticos — rodam na suite padrão (agendados a cada 3h)
const allFlows = [
    { name: "Login", run: loginFlow },
    { name: "Modal Completar Cadastro", run: modalCompletarCadastroFlow },
    { name: "Assinatura Free", run: assinaturaFreeFlow },
    //{ name: "Assinatura Paga", run: assinaturaPagaFlow },
    { name: "Modal Pagamento", run: modalPagamentoFlow },
    { name: "Upload Mídia", run: uploadMidiaFlow },
    //{ name: "Publicar Mídia 25x", run: publicarMidia25xFlow },
];

// Flows manuais — não rodam na suite automática, apenas quando chamados pelo nome
const manualFlows = [
    { name: "Chamada 1:1 Conversão Moeda", run: chamadaUmParaUmFlow },
];

const allFlowsCombined = [...allFlows, ...manualFlows];

// Selecionar flow(s) por argumento: node runner.js "Modal Pagamento" ou node runner.js pagamento
const flowArg = process.argv[2];
const flows = flowArg
    ? (() => {
          const term = flowArg.trim().toLowerCase().replace(/\s+/g, " ");
          const matched = allFlowsCombined.filter(
              (f) => f.name.toLowerCase().replace(/\s+/g, " ").includes(term) || f.name.toLowerCase().replace(/\s+/g, "") === term.replace(/\s+/g, "")
          );
          if (matched.length === 0) {
              console.log("Flows automáticos:", allFlows.map((f) => f.name).join(", "));
              console.log("Flows manuais:", manualFlows.map((f) => f.name).join(", "));
              console.log(`Nenhum flow encontrado para: "${flowArg}"`);
              process.exit(1);
          }
          return matched;
      })()
    : allFlows;

async function run() {
    try {
        await sendExecutionLog();
    } catch (err) {
        console.warn('Aviso: falha ao enviar log de execução para o Slack:', err?.message || err);
    }
    await sendHeartbeatIfDue();

    const results = [];
    const successScreenshots = []; // { flowName, url }
    const failureScreenshots = []; // { flowName, url, error }

    for (const flow of flows) {
        const currentFlowName = flow.name;
        let browser;
        let page;

        try {
            ({ browser, page } = await createBrowser());
            console.log(`🚀 Executando flow: ${flow.name}`);
            const result = await flow.run(page);
            results.push(result);

            try {
                const screenshotPath = `${SCREENSHOTS_DIR}/success-${currentFlowName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`;
                await page.screenshot({ path: screenshotPath, fullPage: false });
                const s3Url = await uploadScreenshot(screenshotPath);
                successScreenshots.push({ flowName: currentFlowName, url: s3Url });
                console.log(`📸 Screenshot de sucesso: ${currentFlowName}`);
            } catch (screenshotErr) {
                console.warn(`Aviso: não foi possível tirar screenshot de sucesso do flow "${currentFlowName}":`, screenshotErr?.message);
            }
        } catch (error) {
            console.error(`❌ Erro no flow "${currentFlowName}":`, error.message || error);

            try {
                if (page) {
                    const screenshotPath = `${SCREENSHOTS_ERROR_DIR}/error-${currentFlowName.replace(/\s+/g, '-').toLowerCase()}-${Date.now()}.png`;
                    await page.screenshot({ path: screenshotPath, fullPage: true });
                    const s3Url = await uploadScreenshot(screenshotPath);
                    failureScreenshots.push({ flowName: currentFlowName, url: s3Url, error: error.message });
                }
            } catch (screenshotError) {
                console.error("Erro ao capturar screenshot de falha:", screenshotError);
            }
        } finally {
            if (browser) {
                try {
                    await browser.close();
                } catch (closeError) {
                    console.warn(`Aviso: falha ao fechar o browser do flow "${currentFlowName}":`, closeError.message);
                }
            }
            await new Promise((r) => setTimeout(r, 500));
        }
    }

    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const hasFailures = failureScreenshots.length > 0;

    const successLines = successScreenshots.map((s) => `✅ *${s.flowName}*: ${s.url}`).join('\n');
    const failureLines = failureScreenshots.map((s) => `❌ *${s.flowName}*: ${s.url}\n   Erro: ${s.error}`).join('\n');

    const statusIcon = hasFailures ? '⚠️' : '✅';
    const statusText = hasFailures
        ? `*${failureScreenshots.length} teste(s) falharam, ${successScreenshots.length} passaram*`
        : `*Todos os testes passaram!*`;

    const msg = [
        `${statusIcon} ${statusText}`,
        `Concluído em: ${now}`,
        successLines && `\n*Sucessos:*\n${successLines}`,
        failureLines && `\n*Falhas:*\n${failureLines}`,
    ].filter(Boolean).join('\n');

    await sendMessage(msg);

    if (hasFailures) {
        console.error(`❌ ${failureScreenshots.length} flow(s) falharam: ${failureScreenshots.map(f => f.flowName).join(', ')}`);
        process.exit(1);
    }

    console.log("✅ Todos os testes passaram com sucesso");
    console.log("Resultados: ", results);
}

run();
