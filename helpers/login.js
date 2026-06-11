import { maybeClickByText } from './maybeClickByText.js';

async function fillShadowInput(page, selector, value) {
  return page.evaluate(({ selector, value }) => {
    const auth = document.querySelector('privacy-web-auth');
    if (!auth || !auth.shadowRoot) return false;
    const input = auth.shadowRoot.querySelector(selector);
    if (!input) return false;
    // Usar o setter nativo força a reatividade do Vue/Angular
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, { selector, value });
}

export async function login(page, email, senha, siteUrl) {
  siteUrl = siteUrl || process.env.SITE_URL || 'https://privacy.com.br';
  await page.goto(`${siteUrl}/auth?route=sign-in`, { waitUntil: 'domcontentloaded' });

  await maybeClickByText(page, /aceitar|accept|ok|entendi/i);

  if (!page._captchaBypassConfigured) {
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = request.url();
      if ((url.includes('service') || url.includes('api')) && url.includes('privacy.com.br') && url.includes('/auth/')) {
        if (['OPTIONS', 'HEAD'].includes(request.method())) {
          await route.continue();
        } else {
          await route.continue({
            headers: {
              ...request.headers(),
              'x-captcha-bypass-token': process.env.CAPTCHA_BYPASS_TOKEN || '0mD8SJZSaW3xeIFDCunTRjrLSUZY5pRZKCJ1WCr3L3To8JvFYesO0aKQdHhhV7GS',
            },
          });
        }
      } else {
        await route.continue();
      }
    });
    page._captchaBypassConfigured = true;
  }

  await page.locator('privacy-web-auth').waitFor({ timeout: 20000, state: 'attached' });

  await page.waitForFunction(() => {
    const el = document.querySelector('privacy-web-auth');
    if (!el || !el.shadowRoot) return false;
    return !!el.shadowRoot.querySelector('input[type="email"], input[type="text"]');
  }, { timeout: 15000 });

  const emailFilled = await fillShadowInput(page, 'input[type="email"]', email)
    || await fillShadowInput(page, 'input[type="text"]', email);

  if (!emailFilled) throw new Error('Não foi possível encontrar ou preencher o campo de email');

  await page.waitForTimeout(300);

  // Playwright pierce shadow DOM automaticamente em CSS selectors — mais confiável que evaluate para senha
  const passwordFilled = await fillShadowInput(page, 'input[type="password"]', senha);
  if (!passwordFilled) throw new Error('Não foi possível encontrar ou preencher o campo de senha');

  await page.waitForTimeout(500);

  const enterBtn = page.locator('privacy-web-auth button').filter({ hasText: /entrar|sign in/i });
  try {
    await enterBtn.waitFor({ state: 'visible', timeout: 5000 });
    await enterBtn.click({ timeout: 5000 });
  } catch {
    const loginClicked = await page.evaluate(() => {
      const auth = document.querySelector('privacy-web-auth');
      if (!auth || !auth.shadowRoot) return false;
      const buttons = auth.shadowRoot.querySelectorAll('button, [role="button"]');
      for (const button of buttons) {
        const text = button.textContent?.trim().toLowerCase() || '';
        if (text.includes('entrar') || text.includes('sign in')) {
          button.click();
          return true;
        }
      }
      return false;
    });
    if (!loginClicked) throw new Error('Não foi possível encontrar ou clicar no botão de entrar');
  }

  // Aguarda sinal de autenticação: URL muda da landing OU componentes do feed aparecem
  const landingUrl = page.url();
  try {
    await page.waitForFunction(
      (initialUrl) => {
        const url = window.location.href;
        if (url !== initialUrl && !url.includes('/auth')) return true;
        if (document.querySelector('privacy-web-floatmenu')) return true;
        if (document.querySelector('#privacy-header--search-button')) return true;
        if (document.querySelector('privacy-web-feed')) return true;
        return false;
      },
      landingUrl,
      { timeout: 30000 }
    );
  } catch {
    await page.screenshot({ path: `screenshots/errors/login-fail-${Date.now()}.png` });
    throw new Error('Login não foi concluído após 15s. Verifique credenciais ou captcha. Screenshot salvo.');
  }

  await page.waitForTimeout(1000);
}

export function PRDlogin() {
  console.warn('PRDlogin está obsoleta. Use login(page, email, senha) com Playwright.');
}
