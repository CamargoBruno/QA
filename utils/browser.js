import { chromium } from 'playwright';

const CAPTCHA_BYPASS_TOKEN = process.env.CAPTCHA_BYPASS_TOKEN || '0mD8SJZSaW3xeIFDCunTRjrLSUZY5pRZKCJ1WCr3L3To8JvFYesO0aKQdHhhV7GS';

export async function createBrowser() {
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
        ],
    });
    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 720 },
        locale: 'pt-BR',
        timezoneId: 'America/Sao_Paulo',
    });
    await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    const page = await context.newPage();

    // Bypass do CAPTCHA: toda nova sessão (cada flow) recebe o header nas requisições de auth
    await page.route('**/*', async (route) => {
        const request = route.request();
        const url = request.url();
        if (url.includes('service') && url.includes('privacy.com.br') && url.includes('/auth/')) {
            if (['OPTIONS', 'HEAD'].includes(request.method())) {
                await route.continue();
            } else {
                await route.continue({
                    headers: {
                        ...request.headers(),
                        'x-captcha-bypass-token': CAPTCHA_BYPASS_TOKEN,
                    },
                });
            }
        } else {
            await route.continue();
        }
    });
    page._captchaBypassConfigured = true;

    return { browser, page };
}