import { createBrowser } from './utils/browser.js';
import agendarMidia25xFlow from './flows/AgendarMidia25x.flow.js';
import { uploadScreenshot } from './services/s3.services.js';
import { sendMessage } from './services/slack.services.js';

async function run() {
  let browser;
  let page;

  const inicio = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`\n🚀 Iniciando flow: Agendar Mídia 25x`);
  console.log(`📅 Início: ${inicio}\n`);

  try {
    ({ browser, page } = await createBrowser());
    const result = await agendarMidia25xFlow(page);

    const fim = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const minutos = Math.floor(result.totalTime / 60000);
    const segundos = Math.floor((result.totalTime % 60000) / 1000);

    const msg = [
      `✅ *Agendar Mídia 25x — PASSOU*`,
      `Agendamentos realizados: ${result.agendamentosRealizados}/25`,
      `Bloqueio no 26º validado: ${result.bloqueioValidado ? 'Sim ✅' : 'Não ❌'}`,
      `Tempo total: ${minutos}m ${segundos}s`,
      `Concluído em: ${fim}`,
    ].join('\n');

    console.log('\n' + msg);
    await sendMessage(msg).catch(() => {});

  } catch (error) {
    console.error('\n❌ Flow falhou:', error.message || error);

    try {
      if (page) {
        const screenshotPath = `screenshots/errors/error-agendar-25x-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const s3Url = await uploadScreenshot(screenshotPath).catch(() => null);

        const fim = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const msg = [
          `❌ *Agendar Mídia 25x — FALHOU*`,
          `Erro: ${error.message}`,
          s3Url ? `Evidência: ${s3Url}` : '',
          `Concluído em: ${fim}`,
        ].filter(Boolean).join('\n');

        await sendMessage(msg).catch(() => {});
      }
    } catch { /* não bloqueia o exit */ }

    process.exit(1);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

run();
