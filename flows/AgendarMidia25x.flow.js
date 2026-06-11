import { login } from '../helpers/login.js';
import AppConfig from '../config/AppConfig.js';
import { uploadScreenshot } from '../services/s3.services.js';

const appConfig = new AppConfig();

const MEDIA_PATH =
  process.env.MEDIA_25X_PATH ||
  'C:/Users/BrunoCamargo/OneDrive - Favitec/Evidências/Midia para automação 25x/IMG_8484.JPG';

const LIMITE_DIARIO = parseInt(process.env.LIMITE_DIARIO || '25', 10);
const TOTAL_TENTATIVAS = LIMITE_DIARIO + 1;

async function fecharOverlaySeExistir(page) {
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

async function agendarUmaVez(page, iteracao) {
  await page.goto(`${appConfig.getSite()}/publisher`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL(/\/publisher/, { timeout: 15000 });
  await fecharOverlaySeExistir(page);
  await page.waitForSelector('.post-upload__content-button', { timeout: 15000 });

  // Upload da mídia
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
  await page.waitForTimeout(2000);

  // Scroll para garantir que todos os switches estejam visíveis
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)).catch(() => {});
  await page.waitForTimeout(1000);

  // Clicar no switch "Agendar publicação" — abre modal com calendário
  // Busca o elemento com texto "Agendar publicação" e clica no switch dentro do mesmo container
  const agendarRow = page.locator('div, li, span, label').filter({ hasText: /Agendar publicação/i }).first();
  const agendarSwitch = agendarRow.locator('.el-switch');

  const switchEncontrado = await agendarSwitch.isVisible({ timeout: 10000 }).catch(() => false);
  if (switchEncontrado) {
    await agendarSwitch.click();
  } else {
    // Fallback: usa o 4º switch da página (ordem visual: Publicação paga, Desafio, Post 24h, Agendar)
    await page.locator('.el-switch').nth(3).click();
  }
  await page.waitForTimeout(1500);

  // Aguarda o modal "Agendando publicação" abrir
  await page.locator('.el-overlay').filter({ hasText: /Agendando publicação/i }).waitFor({ state: 'visible', timeout: 10000 });

  // Hoje já está selecionado por padrão — verifica se "Aplicar" está habilitado
  const aplicarBtn = page.locator('.el-overlay button').filter({ hasText: /Aplicar/i }).first();
  await aplicarBtn.waitFor({ state: 'visible', timeout: 10000 });

  // Aguarda até 15s para o botão habilitar (carregamento da mídia no modal)
  let aplicarBloqueado = true;
  const prazoAplicar = Date.now() + 15000;
  while (Date.now() < prazoAplicar) {
    if (!(await aplicarBtn.isDisabled())) {
      aplicarBloqueado = false;
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (aplicarBloqueado) {
    console.log(`🚫 [${iteracao}] Botão Aplicar desabilitado — limite de agendamentos atingido.`);
    // Fecha o modal antes de retornar
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    return { bloqueado: true };
  }

  await aplicarBtn.click();
  await page.waitForSelector('.el-overlay', { state: 'hidden', timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1000);

  console.log(`📅 [${iteracao}] Data de hoje selecionada e aplicada.`);

  // Aguardar botão "Agendar" habilitar (até 30s para carregar a mídia)
  const agendarBtn = page.locator('button').filter({ hasText: /^Agendar$/ }).first();
  await agendarBtn.waitFor({ state: 'visible', timeout: 15000 });

  let bloqueado = true;
  const prazo = Date.now() + 30000;
  while (Date.now() < prazo) {
    if (!(await agendarBtn.isDisabled())) {
      bloqueado = false;
      break;
    }
    await page.waitForTimeout(1000);
  }

  if (bloqueado) {
    console.log(`🚫 [${iteracao}] Botão Agendar permaneceu desabilitado após 30s — limite atingido.`);
    return { bloqueado: true };
  }

  await agendarBtn.click();
  await page.waitForTimeout(3000);

  return { bloqueado: false };
}

const agendarMidia25xFlow = async (page) => {
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

  console.log(`✅ Login realizado. Iniciando ${TOTAL_TENTATIVAS} tentativas de agendamento...`);
  console.log(`ℹ️  Limite esperado: ${LIMITE_DIARIO} agendamentos/dia. O ${LIMITE_DIARIO + 1}º deve ser bloqueado.\n`);

  let agendamentosRealizados = 0;
  let bloqueioValidado = false;

  for (let i = 1; i <= TOTAL_TENTATIVAS; i++) {
    const deveSerBloqueada = i > LIMITE_DIARIO;
    console.log(`📤 Tentativa ${i}/${TOTAL_TENTATIVAS} — ${deveSerBloqueada ? 'DEVE ser bloqueada' : 'deve agendar'}`);

    const resultado = await agendarUmaVez(page, i);

    const screenshotPath = `screenshots/agendar25x-${String(i).padStart(2, '0')}-${resultado.bloqueado ? 'bloqueada' : 'sucesso'}-${Date.now()}.png`;
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
          `❌ Agendamento ${i} deveria ser bloqueado pelo limite de ${LIMITE_DIARIO}/dia, mas foi permitido.`
        );
      }
      console.log(`✅ [${i}] Bloqueio confirmado. Limite de ${LIMITE_DIARIO} agendamentos/dia validado com sucesso.`);
      bloqueioValidado = true;
    } else {
      if (resultado.bloqueado) {
        throw new Error(
          `❌ Agendamento ${i} foi bloqueado antes de atingir o limite de ${LIMITE_DIARIO}. Esperava que fosse permitido.`
        );
      }
      agendamentosRealizados++;
      console.log(`✅ [${i}] Agendado com sucesso. (${agendamentosRealizados}/${LIMITE_DIARIO})`);
    }
  }

  if (!bloqueioValidado) {
    throw new Error(`❌ O limite de ${LIMITE_DIARIO} agendamentos/dia não foi validado.`);
  }

  const totalTime = Date.now() - startTime;
  const minutos = Math.floor(totalTime / 60000);
  const segundos = Math.floor((totalTime % 60000) / 1000);

  console.log(`\n✅ Flow concluído: ${agendamentosRealizados} agendamentos realizados + 1 bloqueio validado.`);
  console.log(`⏱️  Tempo total: ${minutos}m ${segundos}s`);

  return {
    flow: 'Agendar Mídia 25x',
    totalTime,
    agendamentosRealizados,
    bloqueioValidado,
    status: 'ok',
  };
};

export default agendarMidia25xFlow;
