import { login } from '../helpers/login.js';
import AppConfig from '../config/AppConfig.js';
import fs from 'fs';
import { uploadScreenshot } from '../services/s3.services.js';

const appConfig = new AppConfig();
const SCREENSHOTS_DIR = 'screenshots';

const assinaturaFreeFlow = async (page) => {
  const startTime = Date.now();
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const email = appConfig.getEmail();
  const senha = appConfig.getPassword();

  await page.goto(appConfig.getSite());
  await login(page, email, senha);

  // 1. Acessar a aba "Em alta" no floatmenu
  await page.waitForSelector('privacy-web-floatmenu', { timeout: 15000, state: 'attached' });
  await page.waitForTimeout(1000);

  let emAltaClicked = false;
  try {
    emAltaClicked = await page.evaluate(() => {
      const floatmenu = document.querySelector('privacy-web-floatmenu');
      if (!floatmenu?.shadowRoot) return false;
      const root = floatmenu.shadowRoot;
      for (const btn of root.querySelectorAll('button')) {
        if ((btn.textContent || '').trim().toLowerCase().includes('em alta')) {
          btn.click();
          return true;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if ((el.textContent || '').trim().toLowerCase() === 'em alta') {
          const button = el.closest('button');
          if (button) {
            button.click();
            return true;
          }
        }
      }
      return false;
    });
  } catch (e) {
    if (e.message?.includes('Execution context was destroyed')) {
      emAltaClicked = true;
    } else {
      throw e;
    }
  }

  if (!emAltaClicked) {
    throw new Error('Não foi possível clicar na aba "Em alta" do floatmenu');
  }

  // 2. Aguardar a página topcreators e rolar para carregar a seção "Perfis gratuitos"
  await page.waitForSelector('#privacy-web-ranking', { timeout: 20000 });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, 9999));
  await page.waitForTimeout(2000);

  // 3. Contar os cards disponíveis na seção "Perfis gratuitos"
  const totalFreeCards = await page.evaluate(() => {
    const ranking = document.querySelector('#privacy-web-ranking');
    if (!ranking?.shadowRoot) return 0;
    for (const header of ranking.shadowRoot.querySelectorAll('.ranking-preview-header')) {
      if ((header.textContent || '').toLowerCase().includes('perfis gratuitos')) {
        const container = header.parentElement;
        return container ? container.querySelectorAll('a.avatar, a[class*="avatar"]').length : 0;
      }
    }
    return 0;
  });

  if (totalFreeCards === 0) {
    throw new Error('Seção "Perfis gratuitos" não encontrada ou sem cards na página "Em alta"');
  }

  // 4. Iterar pelos cards até encontrar um perfil com botão "Assinatura gratuita"
  const tentarPerfil = async (index) => {
    if (index >= totalFreeCards) {
      throw new Error('Nenhum perfil gratuito disponível para assinatura na seção "Em alta"');
    }

    // Clicar no avatar do card pelo índice dentro do container da seção
    const cardClicked = await page.evaluate((idx) => {
      const ranking = document.querySelector('#privacy-web-ranking');
      if (!ranking?.shadowRoot) return false;
      for (const header of ranking.shadowRoot.querySelectorAll('.ranking-preview-header')) {
        if ((header.textContent || '').toLowerCase().includes('perfis gratuitos')) {
          const container = header.parentElement;
          const avatars = container?.querySelectorAll('a.avatar, a[class*="avatar"]');
          if (avatars && avatars[idx]) {
            avatars[idx].click();
            return true;
          }
        }
      }
      return false;
    }, index);

    if (!cardClicked) {
      throw new Error(`Não foi possível clicar no card ${index} da seção "Perfis gratuitos"`);
    }

    await page.locator('#privacy-web-user-info').waitFor({ timeout: 20000, state: 'attached' });
    await page.waitForTimeout(1500);

    // Verificar se o perfil tem botão de assinatura gratuita
    const subscriptionButton = await page.evaluateHandle(() => {
      const userInfo = document.querySelector('#privacy-web-user-info');
      if (!userInfo?.shadowRoot) return null;
      return userInfo.shadowRoot.querySelector('.el-button.btn-subscription');
    });

    if (!subscriptionButton || !subscriptionButton.asElement()) {
      // Perfil já assinado — voltar e tentar o próximo
      console.log(`Card ${index} já assinado, tentando próximo...`);
      await page.goBack({ timeout: 10000 });
      await page.locator('#privacy-web-ranking').waitFor({ timeout: 20000 });
      await page.evaluate(() => window.scrollTo(0, 9999));
      await page.waitForTimeout(2000);
      return tentarPerfil(index + 1);
    }

    // 5. Clicar no botão "Assinatura gratuita" via locator (pierce shadow DOM corretamente)
    await subscriptionButton.asElement().waitForElementState('visible', { timeout: 10000 });
    // Usa locator do Playwright para garantir que os event listeners do Vue são acionados
    await page.locator('#privacy-web-user-info .el-button.btn-subscription').click();

    console.log(`Assinatura gratuita realizada com sucesso (card ${index})`);

    // Aguarda a página renderizar completamente após a navegação
    await page.waitForLoadState('load', { timeout: 30000 });
    await page.locator('#privacy-web-user-info').waitFor({ timeout: 20000, state: 'attached' });
    await page.waitForTimeout(8000);

    // 6. Screenshot para evidenciar que o perfil foi assinado
    const screenshotPath = `${SCREENSHOTS_DIR}/assinatura-free-evidencia-${Date.now()}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    try {
      const s3Url = await uploadScreenshot(screenshotPath);
      console.log(`📸 Evidência de assinatura: ${s3Url}`);
    } catch (err) {
      console.warn('Aviso: não foi possível fazer upload do screenshot de evidência:', err?.message);
    }

    // 6a. Clicar em "Gratuito" para confirmar o follow após a assinatura
    await page.waitForTimeout(1500);
    const gratuitoClicked = await page.evaluate(() => {
      const userInfo = document.querySelector('#privacy-web-user-info');
      if (!userInfo?.shadowRoot) return false;
      const sr = userInfo.shadowRoot;
      for (const el of sr.querySelectorAll('button, a, [role="button"]')) {
        if ((el.textContent || '').trim().toLowerCase().includes('gratuito')) {
          el.click();
          return true;
        }
      }
      return false;
    });
    if (gratuitoClicked) {
      console.log('✅ Clicou em "Gratuito" para confirmar follow');
      await page.waitForTimeout(3000);
    } else {
      console.log('ℹ️ Botão "Gratuito" não encontrado — prosseguindo');
    }

    // 7. Clicar no menu de três pontinhos no cabeçalho do perfil
    await page.waitForTimeout(2000);

    const moreMenuClicked = await page.evaluate(() => {
      const userInfo = document.querySelector('#privacy-web-user-info');
      if (!userInfo?.shadowRoot) return false;
      const sr = userInfo.shadowRoot;
      const btn = sr.querySelector('.icon-option .icon-button') ||
                  sr.querySelector('.icon-option') ||
                  sr.querySelector('.block-options button') ||
                  sr.querySelector('.block-options .icon-button') ||
                  sr.querySelector('[class*="more"] button') ||
                  sr.querySelector('[class*="option"] button') ||
                  sr.querySelector('button[class*="option"]') ||
                  sr.querySelector('button[class*="more"]');
      if (btn) {
        btn.click();
        return true;
      }
      return false;
    });

    if (!moreMenuClicked) {
      throw new Error('Não foi possível clicar no menu de três pontinhos do perfil');
    }

    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SCREENSHOTS_DIR}/debug-menu-aberto-${Date.now()}.png` });

    // 8. Clicar em "Deixar de seguir" no menu contextual
    await page.waitForTimeout(1000);

    const unfollowHandle = await page.evaluateHandle(() => {
      const normalized = 'deixar de seguir';
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const searchRoot = (root) => {
        for (const tag of ['button', 'li', 'span', 'div', 'p', 'label', 'a']) {
          for (const el of root.querySelectorAll(tag)) {
            if ((el.textContent || '').trim().toLowerCase().includes(normalized) && isVisible(el)) return el;
          }
        }
        for (const host of root.querySelectorAll('*')) {
          if (host.shadowRoot) {
            const found = searchRoot(host.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      const ui = document.querySelector('#privacy-web-user-info');
      return (ui?.shadowRoot && searchRoot(ui.shadowRoot)) || searchRoot(document.body);
    });

    if (!unfollowHandle?.asElement()) {
      throw new Error('Não foi possível encontrar "Deixar de seguir" no menu');
    }
    await unfollowHandle.asElement().click({ force: true });
    await page.waitForTimeout(3000);

    // Utilitário: busca elemento visível por texto exato em shadow trees e no body
    const findByTextVisible = (text) => {
      const normalized = text.toLowerCase().trim();
      const tags = ['button', 'li', 'span', 'div', 'p', 'label', 'a'];
      const isVisible = (el) => {
        if (!el) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const searchRoot = (root) => {
        for (const tag of tags) {
          for (const el of root.querySelectorAll(tag)) {
            if ((el.textContent || '').trim().toLowerCase() === normalized && isVisible(el)) return el;
          }
        }
        for (const host of root.querySelectorAll('*')) {
          if (host.shadowRoot) {
            const found = searchRoot(host.shadowRoot);
            if (found) return found;
          }
        }
        return null;
      };
      // Tenta no user-info primeiro, depois no body inteiro
      const ui = document.querySelector('#privacy-web-user-info');
      return (ui?.shadowRoot && searchRoot(ui.shadowRoot)) || searchRoot(document.body);
    };

    // 9. Aguardar o novo modal de cancelamento aparecer
    console.log('Aguardando modal de cancelamento...');
    await page.waitForFunction(() => {
      // Busca recursiva em shadow roots a partir de um elemento raiz
      const searchRoot = (root) => {
        // Detecta privacy-web-generic-modal com qualquer atributo show
        for (const m of root.querySelectorAll('privacy-web-generic-modal')) {
          const show = m.getAttribute('show-dialog') || m.getAttribute('show') || m.getAttribute('open');
          if (show && show !== 'false') return true;
          if (m.style.display !== 'none' && m.offsetParent !== null) return true;
        }
        // Detecta qualquer dialog/overlay visível
        for (const el of root.querySelectorAll('[role="dialog"], dialog, .modal, .overlay, .bottom-sheet, [class*="modal"], [class*="dialog"], [class*="sheet"]')) {
          if (el.offsetParent !== null || window.getComputedStyle(el).display !== 'none') return true;
        }
        // Recursivo em nested shadow roots
        for (const host of root.querySelectorAll('*')) {
          if (host.shadowRoot && searchRoot(host.shadowRoot)) return true;
        }
        return false;
      };
      const ui = document.querySelector('#privacy-web-user-info');
      if (ui?.shadowRoot && searchRoot(ui.shadowRoot)) return true;
      // Fallback: modal pode estar no body
      return searchRoot(document.body);
    }, null, { timeout: 15000 });
    console.log('Modal de cancelamento detectado');

    // 10. Clicar em "Deixar de seguir" no modal
    await page.waitForTimeout(500);
    const deixarDeSeguirModal = await page.evaluateHandle(findByTextVisible, 'deixar de seguir');
    if (!deixarDeSeguirModal?.asElement()) {
      throw new Error('Botão "Deixar de seguir" não encontrado no modal');
    }
    await deixarDeSeguirModal.asElement().click({ force: true });
    console.log('"Deixar de seguir" clicado no modal');
    await page.waitForTimeout(1000);

    // 11. Clicar em "O conteúdo do creator"
    const conteudoCriadorOption = await page.evaluateHandle(findByTextVisible, 'o conteúdo do creator');
    if (!conteudoCriadorOption?.asElement()) {
      throw new Error('"O conteúdo do creator" não encontrado no modal');
    }
    await conteudoCriadorOption.asElement().click({ force: true });
    console.log('"O conteúdo do creator" selecionado');
    await page.waitForTimeout(1000);

    // 12. Selecionar "Não gosto mais do conteúdo"
    const naoGostoOption = await page.evaluateHandle(findByTextVisible, 'não gosto mais do conteúdo');
    if (!naoGostoOption?.asElement()) {
      throw new Error('Opção "Não gosto mais do conteúdo" não encontrada no modal');
    }
    await naoGostoOption.asElement().click({ force: true });
    console.log('Opção "Não gosto mais do conteúdo" selecionada');
    await page.waitForTimeout(1000);

    // 13. Clicar no botão "Deixar de seguir" para confirmar
    const confirmarDeixarDeSeguir = await page.evaluateHandle(findByTextVisible, 'deixar de seguir');
    if (!confirmarDeixarDeSeguir?.asElement()) {
      throw new Error('Botão "Deixar de seguir" de confirmação não encontrado no modal');
    }
    await confirmarDeixarDeSeguir.asElement().click({ force: true });
    console.log('Cancelamento confirmado com sucesso');
    await page.waitForTimeout(1000);
  };

  await tentarPerfil(0);

  const totalTime = Date.now() - startTime;

  return {
    flow: 'Assinatura Free Flow',
    totalTime,
    status: 'ok'
  };
};

export default assinaturaFreeFlow;
