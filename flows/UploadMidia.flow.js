import { login } from '../helpers/login.js';
import AppConfig from '../config/AppConfig.js';
import { uploadScreenshot } from '../services/s3.services.js';
import path from 'path';
import fs from 'fs';

const appConfig = new AppConfig();

const uploadMidiaFlow = async (page) => {
  const startTime = Date.now();

  const MEDIA_DIR = process.env.MEDIA_DIR || 'C:/Users/BrunoCamargo/OneDrive - Favitec/Evidências/Midias para automação';

  if (!fs.existsSync(MEDIA_DIR)) {
    throw new Error(`Diretório de mídias não encontrado: ${MEDIA_DIR}`);
  }

  const MIDIAS = fs
    .readdirSync(MEDIA_DIR)
    .filter((file) => /\.(jpg|jpeg|png|gif|mp4|mov|mpeg|m4v|webp|webm|hevc|heic)$/i.test(file))
    .map((file) => path.join(MEDIA_DIR, file));

  if (MIDIAS.length === 0) {
    throw new Error(`Nenhuma mídia encontrada em: ${MEDIA_DIR}`);
  }

  const email = appConfig.getEmail();
  const senha = appConfig.getPassword();

  // 1. Navegar para a tela de login e autenticar
  await page.goto(`${appConfig.getSite()}/auth?route=sign-in`, { waitUntil: 'domcontentloaded' });

  await page.waitForFunction(() => {
    const el = document.querySelector('privacy-web-auth');
    if (!el || !el.shadowRoot) return false;
    return !!el.shadowRoot.querySelector('input[type="email"], input[type="text"]');
  }, { timeout: 20000 });

  await login(page, email, senha);

  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);

  console.log('✅ Login realizado. Navegando para o publisher...');

  // 2. Navegar diretamente para a página de publicação
  await page.goto(`${appConfig.getSite()}/publisher`, { waitUntil: 'domcontentloaded' });

  // 3. Aguardar a página do publisher carregar
  await page.waitForURL(/\/publisher/, { timeout: 15000 });

  await page.waitForSelector('.post-upload__content-button', { timeout: 20000 });

  console.log('✅ Página do publisher aberta. Selecionando mídias...');

  // Aguarda splash terminar e fecha overlay se presente
  // (mesma lógica dos flows 25x que funciona em produção)
  await page.waitForFunction(
    () => {
      const s = document.querySelector('#privacy-splash');
      return !s || s.getAttribute('aria-busy') !== 'true';
    },
    { timeout: 30000 }
  ).catch(() => {});

  const overlayInicial = page.locator('.el-overlay').first();
  if (await overlayInicial.isVisible().catch(() => false)) {
    // Rola o modal ao final para habilitar o botão de ação
    await page.evaluate(() => {
      const dialog = document.querySelector('.el-overlay .el-dialog__body, .el-overlay .post-limit__description, .el-overlay .el-dialog');
      if (dialog) dialog.scrollTop = dialog.scrollHeight;
    }).catch(() => {});
    await page.waitForTimeout(1000);

    const actionBtn = page.locator('.el-overlay .el-button:not([disabled])').first();
    if (await actionBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
      await actionBtn.click();
    } else {
      const headerBtn = page.locator('.el-overlay .el-dialog__headerbtn');
      if (await headerBtn.isVisible().catch(() => false)) {
        await headerBtn.click();
      } else {
        await page.keyboard.press('Escape');
      }
    }
    await page.waitForSelector('.el-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  // 4. Clicar na área de upload para abrir o modal de seleção
  await page.locator('.post-upload__content-button').click();

  // 5. Aguardar o modal "Selecionar mídia" aparecer
  await page.waitForSelector('.media-options__content-list-item', { timeout: 10000 });

  // 6. Clicar em "Biblioteca do dispositivo" e interceptar o file chooser
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser', { timeout: 15000 }),
    page.locator('.media-options__content-list-item').first().click(),
  ]);

  // 7. Definir os arquivos de mídia
  await fileChooser.setFiles(MIDIAS);

  console.log(`✅ ${MIDIAS.length} mídias selecionadas. Aguardando preview...`);

  // 8. Aguardar as miniaturas aparecerem na tela de upload
  await page.waitForSelector('.post-upload__content-files', { timeout: 30000 });

  await page.waitForTimeout(2000);

  // 8a. Fechar overlay que pode aparecer após o upload (ex: modal de novidades/limite)
  const overlayPos = page.locator('.el-overlay').first();
  if (await overlayPos.isVisible().catch(() => false)) {
    const fechou = await page.evaluate(() => {
      const overlay = document.querySelector('.el-overlay');
      if (!overlay) return false;
      const btn = overlay.querySelector('.el-button:not([disabled])') ||
                  overlay.querySelector('.el-dialog__headerbtn');
      if (btn) { btn.click(); return true; }
      return false;
    });
    if (!fechou) await page.keyboard.press('Escape');
    await page.waitForSelector('.el-overlay', { state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  // 9. Clicar em "Continuar"
  const continuarBtn = page.locator('.post-upload__content-bottom-continue-button button');
  await continuarBtn.waitFor({ state: 'visible', timeout: 15000 });
  await continuarBtn.click();

  console.log('✅ Clicou em Continuar. Aguardando tela de publicação...');

  // 10. Aguardar a tela "Criando publicação" carregar
  await page.waitForSelector('.post-builder__content', { timeout: 15000 });

  // Aguarda o botão "Postar" ficar visível e a página terminar de renderizar
  const postarBtn = page.locator('button.el-button--gradient');
  await postarBtn.waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForTimeout(15000);

  // Captura evidência na tela de criação de publicação com as mídias carregadas
  const screenshotPath = `screenshots/upload-midia-evidencia-${Date.now()}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: false });
  try {
    const s3Url = await uploadScreenshot(screenshotPath);
    console.log(`📸 Evidência de upload: ${s3Url}`);
  } catch (err) {
    console.warn('Aviso: não foi possível fazer upload da evidência:', err?.message);
  }

  // Navega para fora sem publicar
  await page.goto(appConfig.getSite(), { waitUntil: 'domcontentloaded' });

  console.log('✅ Upload de mídia validado com sucesso. Publicação cancelada intencionalmente.');

  const totalTime = Date.now() - startTime;

  return {
    flow: 'Upload Mídia',
    totalTime,
    status: 'ok',
  };
};

export default uploadMidiaFlow;
