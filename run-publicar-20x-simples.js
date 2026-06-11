import { createBrowser } from './utils/browser.js';
import { login } from './helpers/login.js';
import AppConfig from './config/AppConfig.js';
import { uploadScreenshot } from './services/s3.services.js';
import { sendMessage } from './services/slack.services.js';
import fs from 'fs';

fs.mkdirSync('screenshots', { recursive: true });
fs.mkdirSync('screenshots/errors', { recursive: true });

const appConfig = new AppConfig();
const TOTAL = 20;

const MEDIA_PATH =
  process.env.MEDIA_25X_PATH ||
  'C:/Users/BrunoCamargo/OneDrive - Favitec/Evidências/Midia para automação 25x/IMG_8484.JPG';

async function fecharOverlaySeExistir(page, iteracao) {
  await page.waitForFunction(
    () => {
      const splash = document.querySelector('#privacy-splash');
      return !splash || splash.getAttribute('aria-busy') !== 'true';
    },
    { timeout: 15000 }
  ).catch(() => {});

  const overlay = page.locator('.el-overlay').first();
  const overlayVisivel = await overlay.isVisible().catch(() => false);
  if (!overlayVisivel) return;

  const screenshotPath = `screenshots/notificacao-publicar-iter${String(iteracao).padStart(2,'0')}-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath }).catch(() => {});
  console.log(`📸 Notificação capturada [iter ${iteracao}]: ${screenshotPath}`);

  await page.evaluate(() => {
    const dialog = document.querySelector('.el-overlay .el-dialog__body, .el-overlay .post-limit__description, .el-overlay .el-dialog');
    if (dialog) dialog.scrollTop = dialog.scrollHeight;
  }).catch(() => {});
  await page.waitForTimeout(1000);

  const actionBtn = page.locator('.el-overlay .el-button:not([disabled])').first();
  const actionBtnHabilitado = await actionBtn.isVisible({ timeout: 10000 }).catch(() => false);
  if (actionBtnHabilitado) {
    await actionBtn.click();
  } else {
    const headerBtn = page.locator('.el-overlay .el-dialog__headerbtn');
    const headerBtnVisivel = await headerBtn.isVisible().catch(() => false);
    if (headerBtnVisivel) {
      await headerBtn.click();
    } else {
      await page.keyboard.press('Escape');
    }
  }

  await page.waitForSelector('.el-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {});
}

async function publicarUmaVez(page, iteracao) {
  await page.goto(`${appConfig.getSite()}/publisher`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/publisher/, { timeout: 15000 });
  await fecharOverlaySeExistir(page, iteracao);
  await page.waitForSelector('.post-upload__content-button', { timeout: 15000 });

  await page.locator('.post-upload__content-button').click();
  await page.waitForSelector('.media-options__content-list-item', { timeout: 10000 });

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    page.locator('.media-options__content-list-item').first().click(),
  ]);
  await fileChooser.setFiles(MEDIA_PATH);

  await page.waitForSelector('.post-upload__content-files', { timeout: 30000 });
  await page.waitForTimeout(1500);

  const continuarBtn = page.locator('.post-upload__content-bottom-continue-button button');
  await continuarBtn.waitFor({ state: 'visible', timeout: 15000 });
  await continuarBtn.click();

  await page.waitForSelector('.post-builder__content', { timeout: 15000 });

  const postarBtn = page.locator('button.el-button--gradient');
  await postarBtn.waitFor({ state: 'visible', timeout: 15000 });

  let bloqueado = true;
  const prazo = Date.now() + 30000;
  while (Date.now() < prazo) {
    if (!(await postarBtn.isDisabled())) {
      bloqueado = false;
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (bloqueado) {
    console.log(`🚫 [${iteracao}] Botão Postar desabilitado — limite atingido.`);
    return { bloqueado: true };
  }

  await postarBtn.click();
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5000);

  return { bloqueado: false };
}

async function run() {
  let browser, page;
  const inicio = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`\n🚀 Iniciando: Publicar Mídia 20x (HML)`);
  console.log(`📅 Início: ${inicio}\n`);

  try {
    ({ browser, page } = await createBrowser());
    await login(page, appConfig.getEmail(), appConfig.getPassword());
    console.log(`✅ Login realizado. Iniciando ${TOTAL} publicações...\n`);

    let realizados = 0;
    const startTime = Date.now();

    for (let i = 1; i <= TOTAL; i++) {
      console.log(`📤 Publicação ${i}/${TOTAL}`);
      const resultado = await publicarUmaVez(page, i);

      const status = resultado.bloqueado ? 'bloqueado' : 'sucesso';
      const screenshotPath = `screenshots/publicar20x-${String(i).padStart(2,'0')}-${status}-${Date.now()}.png`;
      await page.screenshot({ path: screenshotPath }).catch(() => {});

      try {
        const s3Url = await uploadScreenshot(screenshotPath);
        console.log(`📸 Evidência [${i}]: ${s3Url}`);
      } catch {
        console.warn(`Aviso: falha ao enviar evidência ${i} para S3.`);
      }

      if (resultado.bloqueado) {
        console.log(`⚠️  [${i}] Bloqueado (limite atingido antes do esperado).`);
        break;
      }

      realizados++;
      console.log(`✅ [${i}] Publicado com sucesso. (${realizados}/${TOTAL})\n`);
    }

    const totalTime = Date.now() - startTime;
    const min = Math.floor(totalTime / 60000);
    const seg = Math.floor((totalTime % 60000) / 1000);
    const fim = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

    const msg = [
      `✅ *Publicar Mídia 20x HML — CONCLUÍDO*`,
      `Publicações realizadas: ${realizados}/${TOTAL}`,
      `Tempo total: ${min}m ${seg}s`,
      `Concluído em: ${fim}`,
    ].join('\n');

    console.log('\n' + msg);
    await sendMessage(msg).catch(() => {});

  } catch (error) {
    console.error('\n❌ Flow falhou:', error.message || error);

    try {
      if (page) {
        const screenshotPath = `screenshots/errors/error-publicar-20x-${Date.now()}.png`;
        await page.screenshot({ path: screenshotPath, fullPage: true });
        const s3Url = await uploadScreenshot(screenshotPath).catch(() => null);
        const fim = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
        const msg = [
          `❌ *Publicar Mídia 20x HML — FALHOU*`,
          `Erro: ${error.message}`,
          s3Url ? `Evidência: ${s3Url}` : '',
          `Em: ${fim}`,
        ].filter(Boolean).join('\n');
        await sendMessage(msg).catch(() => {});
      }
    } catch { /* não bloqueia */ }

    process.exit(1);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}

run();
