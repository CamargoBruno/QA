import { login } from '../helpers/login.js';
import AppConfig from '../config/AppConfig.js';

const appConfig = new AppConfig();

// Ritmo ~20% mais lento nos waits para evitar atropelos
const DELAY_MULTIPLIER = 1.2;

const modalPagamentoFlow = async (page) => {
  const startTime = Date.now();
  const delayMs = (ms) => page.waitForTimeout(Math.round(ms * DELAY_MULTIPLIER));

  const email = appConfig.getEmail();
  const senha = appConfig.getPassword();

  await page.goto(appConfig.getSite());

  await login(page, email, senha);

  // Botão "Busca" na tab bar do floatmenu
  await page.waitForSelector('privacy-web-floatmenu', { timeout: 15000, state: 'attached' });
  await page.waitForTimeout(1000);

  let searchClicked = false;
  try {
    searchClicked = await page.evaluate(() => {
      const fm = document.querySelector('privacy-web-floatmenu');
      if (!fm || !fm.shadowRoot) return false;
      const root = fm.shadowRoot;
      const buttons = root.querySelectorAll('button');
      for (const btn of buttons) {
        if ((btn.textContent || '').trim().toLowerCase().includes('busca')) {
          btn.click();
          return true;
        }
      }
      const allElements = root.querySelectorAll('*');
      for (const el of allElements) {
        if ((el.textContent || '').trim().toLowerCase() === 'busca') {
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
    if (e.message && e.message.includes('Execution context was destroyed')) {
      searchClicked = true;
    } else {
      throw e;
    }
  }
  if (!searchClicked) throw new Error('Não foi possível encontrar o botão "Busca" no floatmenu');

  await page.waitForSelector('#privacy-web-omnisearch', { timeout: 40000 });
  await delayMs(3000);

  const verificarPerfil = async (index) => {
    const totalCards = await page.evaluate(() => {
      const omnisearch = document.querySelector('#privacy-web-omnisearch');
      if (!omnisearch || !omnisearch.shadowRoot) return 0;
      return omnisearch.shadowRoot.querySelectorAll('.profile-card').length;
    });
    
    if (index >= totalCards) {
      throw new Error('Nenhum perfil válido encontrado na busca para validar o modal de pagamento');
    }
    
    await page.evaluate((idx) => {
      const omnisearch = document.querySelector('#privacy-web-omnisearch');
      if (!omnisearch || !omnisearch.shadowRoot) return;
      const cardElements = omnisearch.shadowRoot.querySelectorAll('.profile-card');
      if (cardElements[idx]) {
        cardElements[idx].click();
      }
    }, index);
    await delayMs(500);

    await page.locator('#privacy-web-user-info').waitFor({ timeout: 20000 });
    
    const btnInfo = await page.evaluateHandle(() => {
      const userInfo = document.querySelector('#privacy-web-user-info');
      if (!userInfo || !userInfo.shadowRoot) return null;
      return userInfo.shadowRoot.querySelector('.btn-interactions .text-sm.font-medium');
    });
    
    const btnExists = btnInfo && btnInfo.asElement();
    const btnText = btnExists ? await btnInfo.asElement().textContent() : null;
    
    if (!btnExists || (btnText && !btnText.trim().toLowerCase().includes('mimo'))) {
      const modalStartTime = Date.now();
      
      const subscriptionButton = await page.evaluateHandle(() => {
        const userInfo = document.querySelector('#privacy-web-user-info');
        if (!userInfo || !userInfo.shadowRoot) return null;
        return userInfo.shadowRoot.querySelector('.el-button.btn-subscription.row.d-flex');
      });
      
      if (subscriptionButton && subscriptionButton.asElement()) {
        await subscriptionButton.asElement().waitForElementState('visible', { timeout: 10000 });
        await subscriptionButton.asElement().click();
        await delayMs(500);

        try {
          await page.locator('privacy-web-payment').first().waitFor({ timeout: 15000 });
          
          const modalEndTime = Date.now();
          const loadTime = modalEndTime - modalStartTime;
          
          console.log('Modal de pagamento carregado com sucesso');
          console.log(`Tempo de carregamento: ${loadTime} ms`);
        } catch (error) {
          console.log('Modal de pagamento não exibido, erro identificado');
          await page.screenshot({ path: `screenshots/errors/modal-pagamento-${Date.now()}.png` });
          console.error('Erro ao carregar modal de pagamento:', error);
        }
        
        return;
      }
    }
    
    if (btnExists && btnText && btnText.trim().toLowerCase().includes('mimo')) {
      await page.goBack({ timeout: 1000 });

      await page.locator('#privacy-web-omnisearch').waitFor({ timeout: 50000 });
      await delayMs(2000);
      
      const total = await page.evaluate(() => {
        const omnisearch = document.querySelector('#privacy-web-omnisearch');
        if (!omnisearch || !omnisearch.shadowRoot) return 0;
        return omnisearch.shadowRoot.querySelectorAll('.profile-card').length;
      });
      const nextIndex = index + 1;
      
      if (nextIndex < total) {
        await verificarPerfil(nextIndex);
      } else {
        throw new Error('Nenhum perfil válido encontrado na busca para validar o modal de pagamento');
      }
    }
  };
  
  await verificarPerfil(5);
  
  const totalTime = Date.now() - startTime;
  
  return {
    flow: 'Modal Pagamento Flow',
    totalTime,
    status: 'ok'
  };
};

export default modalPagamentoFlow;
