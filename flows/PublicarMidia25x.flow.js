import { login } from '../helpers/login.js';
import AppConfig from '../config/AppConfig.js';
import { uploadScreenshot } from '../services/s3.services.js';

const appConfig = new AppConfig();

const MEDIA_PATH =
  process.env.MEDIA_25X_PATH ||
  'C:/Users/BrunoCamargo/OneDrive - Favitec/Evidências/Midia para automação 25x/IMG_8484.JPG';

const LIMITE_DIARIO = parseInt(process.env.LIMITE_DIARIO || '25', 10);
const TOTAL_TENTATIVAS = LIMITE_DIARIO + 1;

async function fecharOverlaySeExistir(page, iteracao) {
  // Aguarda splash screen desaparecer
  await page.waitForFunction(
    () => {
      const splash = document.querySelector('#privacy-splash');
      return !splash || splash.getAttribute('aria-busy') !== 'true';
    },
    { timeout: 15000 }
  ).catch(() => {});

  // Fecha modal de limite de posts (el-overlay com post-limit__description)
  const overlay = page.locator('.el-overlay').first();
  const overlayVisivel = await overlay.isVisible().catch(() => false);
  if (!overlayVisivel) return;

  // Captura screenshot do modal/notificação antes de fechar
  if (iteracao) {
    const screenshotPath = `screenshots/notificacao-publicar-iter${String(iteracao).padStart(2,'0')}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath }).catch(() => {});
    console.log(`📸 Notificação capturada antes de fechar [iter ${iteracao}]: ${screenshotPath}`);
  }

  // Rola até o final do conteúdo do modal para habilitar o botão
  await page.evaluate(() => {
    const dialog = document.querySelector('.el-overlay .el-dialog__body, .el-overlay .post-limit__description, .el-overlay .el-dialog');
    if (dialog) dialog.scrollTop = dialog.scrollHeight;
  }).catch(() => {});
  await page.waitForTimeout(1000);

  // Aguarda o botão de ação do modal habilitar (até 10s)
  const actionBtn = page.locator('.el-overlay .el-button:not([disabled])').first();
  const actionBtnHabilitado = await actionBtn.isVisible({ timeout: 10000 }).catch(() => false);
  if (actionBtnHabilitado) {
    await actionBtn.click();
  } else {
    // Fallback: botão X do header ou Escape
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

  // Aguarda a mídia carregar e o botão habilitar (até 30s)
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
    console.log(`🚫 [${iteracao}] Botão Postar permaneceu desabilitado após 30s — limite atingido.`);
    return { bloqueado: true };
  }

  await postarBtn.click();
  // Aguarda a página processar e exibir possível notificação de limite
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(5000);

  return { bloqueado: false };
}

const publicarMidia25xFlow = async (page) => {
  const startTime = Date.now();

  const email = appConfig.getEmail();
  const senha = appConfig.getPassword();

  await page.goto(`${appConfig.getSite()}/auth?route=sign-in`, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(
    () => {
      const el = document.querySelector('privacy-web-auth');
      if (!el || !el.shadowRoot) return false;
      return !!el.shadowRoot.querySelector('input[type="email"], input[type="text"]');
    },
    { timeout: 20000 }
  );

  await login(page, email, senha);
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);

  console.log(`✅ Login realizado. Iniciando ${TOTAL_TENTATIVAS} tentativas de publicação...`);
  console.log(`ℹ️  Limite esperado: ${LIMITE_DIARIO} publicações/dia. A ${LIMITE_DIARIO + 1}ª deve ser bloqueada.\n`);

  let publicacoesRealizadas = 0;
  let bloqueioValidado = false;

  for (let i = 1; i <= TOTAL_TENTATIVAS; i++) {
    const deveSerBloqueada = i > LIMITE_DIARIO;
    console.log(`📤 Tentativa ${i}/${TOTAL_TENTATIVAS} — ${deveSerBloqueada ? 'DEVE ser bloqueada' : 'deve publicar'}`);

    const resultado = await publicarUmaVez(page, i);

    const screenshotPath = `screenshots/publicar25x-${String(i).padStart(2, '0')}-${resultado.bloqueado ? 'bloqueada' : 'sucesso'}-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath });

    try {
      const s3Url = await uploadScreenshot(screenshotPath);
      console.log(`📸 Evidência [${i}]: ${s3Url}`);
    } catch {
      console.warn(`Aviso: não foi possível enviar evidência da tentativa ${i} para o S3.`);
    }

    if (deveSerBloqueada) {
      if (!resultado.bloqueado) {
        throw new Error(
          `❌ Publicação ${i} deveria ser bloqueada pelo limite de ${LIMITE_DIARIO}/dia, mas foi permitida. ` +
          `Verifique a implementação da feature de limite diário.`
        );
      }
      console.log(`✅ [${i}] Bloqueio confirmado. Limite de ${LIMITE_DIARIO} publicações/dia validado com sucesso.`);
      bloqueioValidado = true;
    } else {
      if (resultado.bloqueado) {
        throw new Error(
          `❌ Publicação ${i} foi bloqueada antes de atingir o limite de ${LIMITE_DIARIO}. ` +
          `Motivo: ${resultado.motivo}. Esperava que esta publicação fosse permitida.`
        );
      }
      publicacoesRealizadas++;
      console.log(`✅ [${i}] Publicada com sucesso. (${publicacoesRealizadas}/${LIMITE_DIARIO})`);
    }
  }

  if (!bloqueioValidado) {
    throw new Error(`❌ O limite de ${LIMITE_DIARIO} publicações/dia não foi validado — a 26ª publicação não foi testada.`);
  }

  const totalTime = Date.now() - startTime;
  const minutos = Math.floor(totalTime / 60000);
  const segundos = Math.floor((totalTime % 60000) / 1000);

  console.log(`\n✅ Flow concluído: ${publicacoesRealizadas} publicações realizadas + 1 bloqueio validado.`);
  console.log(`⏱️  Tempo total: ${minutos}m ${segundos}s`);

  return {
    flow: 'Publicar Mídia 25x',
    totalTime,
    publicacoesRealizadas,
    bloqueioValidado,
    status: 'ok',
  };
};

export default publicarMidia25xFlow;
