import { login } from '../helpers/login.js';
import AppConfig from '../config/AppConfig.js';

const appConfig = new AppConfig();

/**
 * Flow: Login e realização de assinatura de perfil pago.
 * Localiza um perfil pago ainda não assinado, assina e valida o modal "Completar cadastro".
 */
const modalCompletarCadastroFlow = async (page) => {
  const startTime = Date.now();

  const email = appConfig.getEmailModal();
  const senha = appConfig.getPasswordModal();

  await page.goto(appConfig.getSite());

  await login(page, email, senha);

  // Aguardar o floatmenu estar presente antes de clicar
  await page.waitForSelector('privacy-web-floatmenu', { timeout: 15000, state: 'attached' });
  await page.waitForTimeout(1000);

  // Clicar no botão "Buscar": privacy-web-floatmenu > shadow DOM > botão com texto "Buscar"
  // (O clique pode causar navegação e destruir o contexto do evaluate; tratamos isso como sucesso.)
  let floatmenuSearchClicked = false;
  try {
    floatmenuSearchClicked = await page.evaluate(() => {
      const floatmenu = document.querySelector('privacy-web-floatmenu');
      if (!floatmenu || !floatmenu.shadowRoot) return false;
      const root = floatmenu.shadowRoot;
      // 1) Qualquer botão no shadow cujo texto contenha "buscar"
      const allButtons = root.querySelectorAll('button');
      for (const btn of allButtons) {
        const text = (btn.textContent || '').trim().toLowerCase();
        if (text.includes('busca')) {
          btn.click();
          return true;
        }
      }
      // 2) Qualquer elemento cujo texto seja "Busca" e que esteja dentro de um botão
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
      floatmenuSearchClicked = true;
    } else {
      throw e;
    }
  }
  if (!floatmenuSearchClicked) {
    throw new Error('Não foi possível encontrar ou clicar no botão "Buscar" do floatmenu');
  }

  await page.waitForSelector('#privacy-web-omnisearch', { timeout: 40000 });
  await page.waitForTimeout(3000);
  
  const verificarPerfil = async (index) => {
    // Obter total de cards de perfil
    const totalCards = await page.evaluate(() => {
      const omnisearch = document.querySelector('#privacy-web-omnisearch');
      if (!omnisearch || !omnisearch.shadowRoot) return 0;
      return omnisearch.shadowRoot.querySelectorAll('.profile-card').length;
    });
    
    if (index >= totalCards) {
      console.log('Nenhum perfil válido encontrado');
      return;
    }
    
    // Clicar no card de perfil pelo índice
    await page.evaluate((idx) => {
      const omnisearch = document.querySelector('#privacy-web-omnisearch');
      if (!omnisearch || !omnisearch.shadowRoot) return;
      const cardElements = omnisearch.shadowRoot.querySelectorAll('.profile-card');
      if (cardElements[idx]) {
        cardElements[idx].click();
      }
    }, index);
    
    // Aguardar o componente de informações do usuário aparecer
    await page.locator('#privacy-web-user-info').waitFor({ timeout: 20000, state: 'visible' });
    
    // Verificar se existe o botão de interação e obter seu texto
    const btnInfo = await page.evaluate(() => {
      const userInfo = document.querySelector('#privacy-web-user-info');
      if (!userInfo || !userInfo.shadowRoot) return null;
      const btn = userInfo.shadowRoot.querySelector('.btn-interactions .text-sm.font-medium');
      return btn ? btn.textContent : null;
    });
    
    const hasMimoButton = btnInfo && btnInfo.trim().toLowerCase().includes('mimo');
    
    // Se não tem botão Mimo, tentar abrir o modal de completar cadastro
    if (!hasMimoButton) {
      const modalStartTime = Date.now();
      
      const subscriptionButtonClicked = await page.evaluate(() => {
        const userInfo = document.querySelector('#privacy-web-user-info');
        if (!userInfo || !userInfo.shadowRoot) return false;
        const subscriptionButton = userInfo.shadowRoot.querySelector('.el-button.btn-subscription.row.d-flex');
        if (subscriptionButton) {
          subscriptionButton.click();
          return true;
        }
        return false;
      });
      
      if (subscriptionButtonClicked) {
        try {
          // Aguardar o modal de pagamento aparecer (first() evita strict mode com múltiplos matches)
          await page.locator('privacy-web-payment').first().waitFor({
            timeout: 15000,
            state: 'visible'
          });
          
          // Verificar se o corpo do diálogo está presente
          const dialogBodyExists = await page.evaluate(() => {
            const payment = document.querySelector('privacy-web-payment');
            if (!payment || !payment.shadowRoot) return false;
            return !!payment.shadowRoot.querySelector('.el-dialog__body');
          });
          
          if (dialogBodyExists) {
            const modalEndTime = Date.now();
            const loadTime = modalEndTime - modalStartTime;
            
            console.log('Modal de completar os dados carregado com sucesso');
            console.log(`Tempo de carregamento: ${loadTime} ms`);
          }
        } catch (error) {
          console.log('Modal de completar dados não exibido, erro identificado');
          await page.screenshot({ path: `screenshots/errors/modal-completar-cadastro-${Date.now()}.png` });
          console.error('Erro ao carregar modal de completar dados:', error);
        }
        
        return;
      }
    }
    
    // Se tem botão Mimo, voltar e tentar próximo perfil
    if (hasMimoButton) {
      await page.goBack({ timeout: 1000 });
      
      // Aguardar o omnisearch aparecer novamente
      await page.locator('#privacy-web-omnisearch').waitFor({ 
        timeout: 50000, 
        state: 'visible' 
      });
      await page.waitForTimeout(2000);

      // Obter total de cards atualizado
      const total = await page.evaluate(() => {
        const omnisearch = document.querySelector('#privacy-web-omnisearch');
        if (!omnisearch || !omnisearch.shadowRoot) return 0;
        return omnisearch.shadowRoot.querySelectorAll('.profile-card').length;
      });
      
      const nextIndex = index + 1;
      
      if (nextIndex < total) {
        await verificarPerfil(nextIndex);
      } else {
        console.log('Nenhum perfil válido encontrado');
      }
    }
  };
  
  await verificarPerfil(5);
  
  const totalTime = Date.now() - startTime;
  
  return {
    flow: 'Modal Completar Cadastro Flow',
    totalTime,
    status: 'ok'
  };
};

export default modalCompletarCadastroFlow;
