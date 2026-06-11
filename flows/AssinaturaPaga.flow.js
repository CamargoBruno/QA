import { login } from '../helpers/login.js';
import AppConfig from '../config/AppConfig.js';

const appConfig = new AppConfig();

const assinaturaPagaFlow = async (page) => {
  const startTime = Date.now();
  
  const email = appConfig.getEmail();
  const senha = appConfig.getPassword();
  
  await page.goto(appConfig.getSite());
  
  await login(page, email, senha);
  
  await page.locator('#privacy-header--search-button').click();
  
  const tabAll = await page.evaluateHandle(() => {
    const omnisearch = document.querySelector('#privacy-web-omnisearch');
    if (!omnisearch || !omnisearch.shadowRoot) return null;
    return omnisearch.shadowRoot.querySelector('#tab-all.el-tabs__item.is-top.is-active');
  });
  
  if (tabAll && tabAll.asElement()) {
    await tabAll.asElement().waitForElementState('visible', { timeout: 40000 });
    await tabAll.asElement().click({ force: true });
  }
  
  await page.waitForTimeout(3000);
  
  const verificarPerfil = async (index) => {
    const totalCards = await page.evaluate(() => {
      const omnisearch = document.querySelector('#privacy-web-omnisearch');
      if (!omnisearch || !omnisearch.shadowRoot) return 0;
      return omnisearch.shadowRoot.querySelectorAll('.profile-card').length;
    });
    
    if (index >= totalCards) {
      console.log('Nenhum perfil válido encontrado');
      return;
    }
    
    await page.evaluate((idx) => {
      const omnisearch = document.querySelector('#privacy-web-omnisearch');
      if (!omnisearch || !omnisearch.shadowRoot) return;
      const cardElements = omnisearch.shadowRoot.querySelectorAll('.profile-card');
      if (cardElements[idx]) {
        cardElements[idx].click();
      }
    }, index);
    
    await page.locator('#privacy-web-user-info').waitFor({ timeout: 20000 });
    
    const btnInfo = await page.evaluateHandle(() => {
      const userInfo = document.querySelector('#privacy-web-user-info');
      if (!userInfo || !userInfo.shadowRoot) return null;
      return userInfo.shadowRoot.querySelector('.btn-interactions .text-sm.font-medium');
    });
    
    const btnExists = btnInfo && btnInfo.asElement();
    const btnText = btnExists ? await btnInfo.asElement().textContent() : null;
    
    if (!btnExists || (btnText && !btnText.trim().toLowerCase().includes('mimo'))) {
      const subscriptionButton = await page.evaluateHandle(() => {
        const userInfo = document.querySelector('#privacy-web-user-info');
        if (!userInfo || !userInfo.shadowRoot) return null;
        return userInfo.shadowRoot.querySelector('.el-button.btn-subscription.row.d-flex');
      });
      
      if (subscriptionButton && subscriptionButton.asElement()) {
        await subscriptionButton.asElement().waitForElementState('visible', { timeout: 10000 });
        await subscriptionButton.asElement().click();
        
        await page.locator('#privacy-web-payment').waitFor({ timeout: 15000 });
        
        const paymentMethod = await page.evaluateHandle(() => {
          const payment = document.querySelector('#privacy-web-payment');
          if (!payment || !payment.shadowRoot) return null;
          return payment.shadowRoot.querySelector('.d-flex.payment-method-item-content.payment-method-wallet-card');
        });
        
        if (paymentMethod && paymentMethod.asElement()) {
          await paymentMethod.asElement().waitFor({ timeout: 10000 });
          await paymentMethod.asElement().click({ force: true });
        }
        
        const confirmButton = await page.evaluateHandle(() => {
          const payment = document.querySelector('#privacy-web-payment');
          if (!payment || !payment.shadowRoot) return null;
          return payment.shadowRoot.querySelector('.el-button.el-button--outline.is-plain');
        });
        
        if (confirmButton && confirmButton.asElement()) {
          await confirmButton.asElement().waitForElementState('visible', { timeout: 20000 });
          await confirmButton.asElement().click();
        }
        
        return;
      }
    }
    
    if (btnExists && btnText && btnText.trim().toLowerCase().includes('mimo')) {
      await page.goBack({ timeout: 1000 });
      
      await page.locator('#privacy-web-omnisearch').waitFor({ timeout: 50000 });
      await page.waitForTimeout(2000);
      
      const tabAllAgain = await page.evaluateHandle(() => {
        const omnisearch = document.querySelector('#privacy-web-omnisearch');
        if (!omnisearch || !omnisearch.shadowRoot) return null;
        return omnisearch.shadowRoot.querySelector('#tab-all.el-tabs__item.is-top.is-active');
      });
      
      if (tabAllAgain && tabAllAgain.asElement()) {
        await tabAllAgain.asElement().waitForElementState('visible', { timeout: 30000 });
        await tabAllAgain.asElement().click();
      }
      
      await page.waitForTimeout(2000);
      
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
    flow: 'Assinatura Paga Flow',
    totalTime,
    status: 'ok'
  };
};

export default assinaturaPagaFlow;
