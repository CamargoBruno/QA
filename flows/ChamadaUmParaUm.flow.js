import { login } from '../helpers/login.js';
import { createBrowser } from '../utils/browser.js';

/**
 * Flow: Conversão de moeda na chamada 1:1
 *
 * Reproduz o bug onde o criador de outro país define um preço em moeda
 * estrangeira (ARS) e o assinante brasileiro vê o valor sem conversão.
 *
 * ─── Seletores confirmados ao vivo (01/06/2026) ───────────────────────────────
 *
 *  Shadow host do chat:
 *    #privacy-web-chat  →  .shadowRoot
 *
 *  Lista de conversas (dentro do shadow root do chat):
 *    Item:           .vac-room-item
 *    Item ativo:     .vac-room-item.vac-room-selected
 *    Nome contato:   .name.vac-text-ellipsis   (filho de .vac-room-item)
 *    Campo de busca: input.el-input__inner      (primeiro input no shadow root)
 *
 *  Compose bar — host aninhado dentro do shadow root do chat:
 *    privacy-web-contenteditor  →  .shadowRoot
 *    Botão Videochamada:  .btn-wrapper.el-tooltip__trigger > .ce-button-svg.btn-meeting
 *    SVG dentro do botão: svg.svg-inline--fa.fa-video  [data-icon="video"]
 *    Tooltip:             "Videochamada"
 *
 *  Modal "Solicitar videochamada" (.el-dialog.schedule-dialog):
 *    Localizado via: overlay com texto "solicitar videochamada" nos shadow roots
 *    Input preço:    input.el-input__inner[inputmode="numeric"][placeholder="00,00"]
 *    Input duração:  input.el-input__inner[placeholder="05:00"]
 *    Input data/hora:input.el-input__inner[placeholder="Selecione a data e hora"]
 *    Textarea msg:   textarea.el-textarea__inner
 *    Confirmar:      button.el-button--primary.btn-primary
 *    Fechar:         button.el-button--secondary.btn-secondary
 * ─────────────────────────────────────────────────────────────────────────────
 */

const CALL_PRICE_ARS = process.env.CHAMADA_PRECO_ARS || '33000';
const VALOR_BRUTO_ARS = parseFloat(CALL_PRICE_ARS);
const SITE_URL = process.env.CHAMADA_SITE_URL || process.env.SITE_URL || 'https://privacy.com.br';
const CHAMADA_SITE_URL = process.env.CHAMADA_SITE_URL || process.env.SITE_URL || 'https://privacy.com.br';

// ─── Utilitário: busca .el-overlay com texto alvo percorrendo shadow roots ────
const JS_FIND_OVERLAY = `
  (function findOverlay(root, text) {
    for (const o of root.querySelectorAll('.el-overlay')) {
      if (o.textContent?.toLowerCase().includes(text)) return o;
    }
    for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
      const r = findOverlay(h.shadowRoot, text);
      if (r) return r;
    }
    return null;
  })
`;

const chamadaUmParaUmFlow = async (page) => {
  const startTime = Date.now();

  const creatorEmail    = process.env.TEST_USER_CRIADOR_AR;
  const creatorPassword = process.env.TEST_PASS_CRIADOR_AR;
  const subscriberEmail = process.env.TEST_USER_ASSINANTE_BR;
  const subscriberPass  = process.env.TEST_PASS_ASSINANTE_BR;
  const subscriberName  = process.env.TEST_NOME_ASSINANTE_BR; // ex: "BC_Private"
  const creatorName     = process.env.TEST_NOME_CRIADOR_AR;

  if (!creatorEmail || !creatorPassword || !subscriberEmail || !subscriberPass) {
    throw new Error(
      'Variáveis de ambiente do flow ChamadaUmParaUm não configuradas.\n' +
      'Necessário: TEST_USER_CRIADOR_AR, TEST_PASS_CRIADOR_AR, ' +
      'TEST_USER_ASSINANTE_BR, TEST_PASS_ASSINANTE_BR, ' +
      'TEST_NOME_CRIADOR_AR, TEST_NOME_ASSINANTE_BR'
    );
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 1 — Criador (AR) abre o chat e envia proposta de chamada 1:1
  // ═══════════════════════════════════════════════════════════════════════
  console.log('👤 [Criador AR] Iniciando sessão...');
  await login(page, creatorEmail, creatorPassword, CHAMADA_SITE_URL);
  await page.goto(`${SITE_URL}/chat`, { waitUntil: 'domcontentloaded' });

  // Aguarda a lista de conversas renderizar
  await page.waitForFunction(() => {
    return !!(document.querySelector('#privacy-web-chat')
      ?.shadowRoot?.querySelector('.vac-room-item'));
  }, { timeout: 20000 });
  await page.waitForTimeout(1500);

  // 1.1 — Localiza e clica na conversa com o assinante
  console.log(`💬 [Criador AR] Abrindo conversa com "${subscriberName}"...`);
  const conversaAberta = await page.evaluate((nome) => {
    const root = document.querySelector('#privacy-web-chat')?.shadowRoot;
    if (!root) return false;

    // Procura pelo nome exato em .name.vac-text-ellipsis dentro de .vac-room-item
    for (const item of root.querySelectorAll('.vac-room-item')) {
      const nameEl = item.querySelector('.name.vac-text-ellipsis');
      if (nameEl?.textContent?.trim().toLowerCase().includes(nome.toLowerCase())) {
        item.click();
        return true;
      }
    }

    // Fallback: usa o campo de busca (input.el-input__inner)
    const searchInput = root.querySelector('input.el-input__inner');
    if (searchInput) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(searchInput, nome);
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      return 'search';
    }
    return false;
  }, subscriberName);

  if (conversaAberta === 'search') {
    await page.waitForTimeout(1500);
    const clicado = await page.evaluate((nome) => {
      const root = document.querySelector('#privacy-web-chat')?.shadowRoot;
      for (const item of (root?.querySelectorAll('.vac-room-item') || [])) {
        const nameEl = item.querySelector('.name.vac-text-ellipsis');
        if (nameEl?.textContent?.trim().toLowerCase().includes(nome.toLowerCase())) {
          item.click();
          return true;
        }
      }
      return false;
    }, subscriberName);
    if (!clicado) throw new Error(`[Criador AR] Conversa "${subscriberName}" não encontrada`);
  } else if (!conversaAberta) {
    throw new Error(`[Criador AR] Conversa "${subscriberName}" não encontrada`);
  }

  // Aguarda a conversa abrir (.vac-room-item.vac-room-selected)
  await page.waitForFunction((nome) => {
    const root = document.querySelector('#privacy-web-chat')?.shadowRoot;
    const selected = root?.querySelector('.vac-room-item.vac-room-selected');
    return selected?.querySelector('.name.vac-text-ellipsis')
      ?.textContent?.trim().toLowerCase().includes(nome.toLowerCase());
  }, subscriberName, { timeout: 10000 });
  await page.waitForTimeout(1000);

  // 1.2 — Aguarda o botão "Videochamada" (.ce-button-svg.btn-meeting) aparecer
  console.log('⏳ [Criador AR] Aguardando botão de Videochamada...');
  await page.waitForFunction(() => {
    const ceRoot = document.querySelector('#privacy-web-chat')
      ?.shadowRoot?.querySelector('privacy-web-contenteditor')?.shadowRoot;
    return !!(ceRoot?.querySelector('.ce-button-svg.btn-meeting'));
  }, { timeout: 15000 });

  // 1.3 — Clica no botão de Videochamada
  // Seletor: .btn-wrapper.el-tooltip__trigger > .ce-button-svg.btn-meeting
  // SVG interno: svg.svg-inline--fa.fa-video [data-icon="video"]
  console.log('🎥 [Criador AR] Clicando em "Videochamada"...');
  await page.evaluate(() => {
    const ceRoot = document.querySelector('#privacy-web-chat')
      ?.shadowRoot?.querySelector('privacy-web-contenteditor')?.shadowRoot;
    const btn = ceRoot?.querySelector('.ce-button-svg.btn-meeting');
    if (!btn) throw new Error('Botão .ce-button-svg.btn-meeting não encontrado');
    btn.click();
  });

  // 1.4 — Aguarda qualquer modal aparecer após clicar no botão de videochamada
  // Pode ser: (a) intro "Conheça nossa videochamada" ou (b) direto "Solicitar videochamada"
  console.log('📋 [Criador AR] Aguardando modal de videochamada...');
  await page.waitForFunction(() => {
    function findOverlay(root, text) {
      for (const o of root.querySelectorAll('.el-overlay')) {
        if (o.textContent?.toLowerCase().includes(text)) return o;
      }
      for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
        const r = findOverlay(h.shadowRoot, text);
        if (r) return r;
      }
      return null;
    }
    return !!(
      findOverlay(document, 'solicitar videochamada') ||
      findOverlay(document, 'conheça nossa videochamada') ||
      findOverlay(document, 'videochamada')
    );
  }, { timeout: 20000 });
  await page.waitForTimeout(500);

  // 1.5 — Se for o modal de boas-vindas, clica em "Usar a videochamada" e aguarda o schedule-dialog
  const eraIntroModal = await page.evaluate(() => {
    function findOverlay(root, text) {
      for (const o of root.querySelectorAll('.el-overlay')) {
        if (o.textContent?.toLowerCase().includes(text)) return o;
      }
      for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
        const r = findOverlay(h.shadowRoot, text);
        if (r) return r;
      }
      return null;
    }
    const introOverlay = findOverlay(document, 'conheça nossa videochamada');
    if (!introOverlay) return false;
    // Clica em "Usar a videochamada"
    const btns = [...introOverlay.querySelectorAll('button')];
    for (const btn of btns) {
      if (btn.textContent?.trim().toLowerCase().includes('usar a videochamada')) {
        btn.click();
        return true;
      }
    }
    // Fallback: clica no primeiro botão primário do overlay
    const primaryBtn = introOverlay.querySelector('button.el-button--primary, button.btn-primary');
    if (primaryBtn) { primaryBtn.click(); return true; }
    return false;
  });

  if (eraIntroModal) {
    console.log('ℹ️  [Criador AR] Modal de boas-vindas dispensado, aguardando modal de solicitação...');
    await page.waitForFunction(() => {
      function findOverlay(root, text) {
        for (const o of root.querySelectorAll('.el-overlay')) {
          if (o.textContent?.toLowerCase().includes(text)) return o;
        }
        for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
          const r = findOverlay(h.shadowRoot, text);
          if (r) return r;
        }
        return null;
      }
      return !!(findOverlay(document, 'solicitar videochamada')?.querySelector('.schedule-dialog'));
    }, { timeout: 15000 });
  }
  await page.waitForTimeout(500);

  // 1.6 — Preenche o preço em ARS
  // Seletor: input.el-input__inner[inputmode="numeric"][placeholder="00,00"]
  console.log(`💰 [Criador AR] Preenchendo preço: ${CALL_PRICE_ARS} ARS...`);
  const precoPreenchido = await page.evaluate((valor) => {
    function findOverlay(root, text) {
      for (const o of root.querySelectorAll('.el-overlay')) {
        if (o.textContent?.toLowerCase().includes(text)) return o;
      }
      for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
        const r = findOverlay(h.shadowRoot, text);
        if (r) return r;
      }
      return null;
    }
    const dialog = findOverlay(document, 'solicitar videochamada')
      ?.querySelector('.schedule-dialog');
    // Tenta o seletor exato primeiro, depois fallbacks mais genéricos
    const input =
      dialog?.querySelector('input.el-input__inner[inputmode="numeric"][placeholder="00,00"]') ||
      dialog?.querySelector('input.el-input__inner[inputmode="numeric"]') ||
      dialog?.querySelector('input[inputmode="numeric"]') ||
      [...(dialog?.querySelectorAll('input.el-input__inner') || [])].find(i => i.offsetParent !== null);
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, valor);
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    return true;
  }, CALL_PRICE_ARS);

  if (!precoPreenchido) throw new Error('[Criador AR] Input de preço não encontrado no modal');
  await page.waitForTimeout(500);

  // 1.7 — Preenche a duração (obrigatório) — ex: "05:00"
  console.log('⏱️  [Criador AR] Preenchendo duração: 05:00...');
  await page.evaluate(() => {
    function findOverlay(root, text) {
      for (const o of root.querySelectorAll('.el-overlay')) {
        if (o.textContent?.toLowerCase().includes(text)) return o;
      }
      for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
        const r = findOverlay(h.shadowRoot, text);
        if (r) return r;
      }
      return null;
    }
    const dialog = findOverlay(document, 'solicitar videochamada')
      ?.querySelector('.schedule-dialog');
    // Seletor confirmado: input.el-input__inner[placeholder="05:00"]
    const input =
      dialog?.querySelector('input.el-input__inner[placeholder="05:00"]') ||
      [...(dialog?.querySelectorAll('input.el-input__inner') || [])][1];
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    setter.call(input, '05:00');
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
  });
  await page.waitForTimeout(500);

  // 1.8 — Debug: captura estado do modal antes de confirmar
  const estadoAntes = await page.evaluate(() => {
    function findOverlay(root, text) {
      for (const o of root.querySelectorAll('.el-overlay')) {
        if (o.textContent?.toLowerCase().includes(text)) return o;
      }
      for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
        const r = findOverlay(h.shadowRoot, text);
        if (r) return r;
      }
      return null;
    }
    const dialog = findOverlay(document, 'solicitar videochamada')?.querySelector('.schedule-dialog');
    const inputs = [...(dialog?.querySelectorAll('input') || [])].map(i => ({
      placeholder: i.placeholder, value: i.value, disabled: i.disabled
    }));
    const confirmBtn = dialog?.querySelector('button.el-button--primary.btn-primary');
    const erros = [...(dialog?.querySelectorAll('.el-form-item__error, [class*="error"]') || [])]
      .map(e => e.textContent?.trim()).filter(Boolean);
    return { inputs, btnDisabled: confirmBtn?.disabled, btnClass: confirmBtn?.className, erros };
  });
  console.log('🔎 [Criador AR] Estado do modal antes de confirmar:', JSON.stringify(estadoAntes));
  await page.screenshot({ path: 'screenshots/debug-modal-antes-confirmar.png' });

  // 1.9 — Clica em "Confirmar" (button.el-button--primary.btn-primary)
  console.log('✅ [Criador AR] Confirmando proposta...');
  const confirmado = await page.evaluate(() => {
    function findOverlay(root, text) {
      for (const o of root.querySelectorAll('.el-overlay')) {
        if (o.textContent?.toLowerCase().includes(text)) return o;
      }
      for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
        const r = findOverlay(h.shadowRoot, text);
        if (r) return r;
      }
      return null;
    }
    const dialog = findOverlay(document, 'solicitar videochamada')
      ?.querySelector('.schedule-dialog');
    const btn = dialog?.querySelector('button.el-button--primary.btn-primary');
    if (!btn) return 'nao_encontrado';
    if (btn.disabled) return 'desabilitado';
    btn.click();
    return 'ok';
  });

  if (confirmado === 'nao_encontrado') throw new Error('[Criador AR] Botão Confirmar não encontrado');
  if (confirmado === 'desabilitado')   throw new Error(`[Criador AR] Botão Confirmar desabilitado — verifique se o valor mínimo foi atingido`);

  await page.waitForTimeout(2000);

  // 1.9b — Segunda confirmação: modal "Resumo da videochamada"
  // Após confirmar o agendamento, abre um resumo com outro botão "Confirmar"
  const temResumo = await page.evaluate(() => {
    function findOverlay(root, text) {
      for (const o of root.querySelectorAll('.el-overlay')) {
        if (o.textContent?.toLowerCase().includes(text)) return o;
      }
      for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
        const r = findOverlay(h.shadowRoot, text);
        if (r) return r;
      }
      return null;
    }
    const resumoOverlay = findOverlay(document, 'resumo da videochamada');
    if (!resumoOverlay) return false;
    const btn = resumoOverlay.querySelector('button.el-button--primary.btn-primary, button.btn-primary');
    if (btn && !btn.disabled) { btn.click(); return true; }
    return false;
  });

  if (temResumo) {
    console.log('✅ [Criador AR] Resumo da videochamada confirmado!');
    await page.waitForTimeout(2000);
  }

  // Aguarda o modal fechar — tenta 8s, prossegue mesmo se não fechar
  await page.waitForFunction(() => {
    function findOverlay(root, text) {
      for (const o of root.querySelectorAll('.el-overlay')) {
        if (o.textContent?.toLowerCase().includes(text)) return o;
      }
      for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
        const r = findOverlay(h.shadowRoot, text);
        if (r) return r;
      }
      return null;
    }
    const overlay = findOverlay(document, 'solicitar videochamada');
    if (!overlay) return true;
    if (!overlay.querySelector('.schedule-dialog')) return true;
    return false;
  }, { timeout: 8000 }).catch(() => {
    console.log('ℹ️  [Criador AR] Modal ainda visível após 8s — prosseguindo...');
  });

  console.log('✅ [Criador AR] Proposta de chamada enviada!');
  await page.waitForTimeout(2000);

  // ═══════════════════════════════════════════════════════════════════════
  // PASSO 2 — Assinante (BR) recebe e verifica o valor exibido
  // ═══════════════════════════════════════════════════════════════════════
  console.log('👤 [Assinante BR] Iniciando segunda sessão...');
  const { browser: browserAssinante, page: pageAssinante } = await createBrowser();

  try {
    await login(pageAssinante, subscriberEmail, subscriberPass, CHAMADA_SITE_URL);
    await pageAssinante.goto(`${SITE_URL}/chat`, { waitUntil: 'domcontentloaded' });

    await pageAssinante.waitForFunction(() => {
      return !!(document.querySelector('#privacy-web-chat')
        ?.shadowRoot?.querySelector('.vac-room-item'));
    }, { timeout: 20000 });
    await pageAssinante.waitForTimeout(1500);

    // 2.1 — Abre a conversa com o criador
    console.log(`💬 [Assinante BR] Abrindo conversa com "${creatorName}"...`);
    const convAberta = await pageAssinante.evaluate((nome) => {
      const root = document.querySelector('#privacy-web-chat')?.shadowRoot;
      for (const item of (root?.querySelectorAll('.vac-room-item') || [])) {
        const nameEl = item.querySelector('.name.vac-text-ellipsis');
        if (nameEl?.textContent?.trim().toLowerCase().includes(nome.toLowerCase())) {
          item.click();
          return true;
        }
      }
      const searchInput = root?.querySelector('input.el-input__inner');
      if (searchInput) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        setter.call(searchInput, nome);
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        return 'search';
      }
      return false;
    }, creatorName);

    if (convAberta === 'search') {
      await pageAssinante.waitForTimeout(1500);
      await pageAssinante.evaluate((nome) => {
        const root = document.querySelector('#privacy-web-chat')?.shadowRoot;
        for (const item of (root?.querySelectorAll('.vac-room-item') || [])) {
          const nameEl = item.querySelector('.name.vac-text-ellipsis');
          if (nameEl?.textContent?.trim().toLowerCase().includes(nome.toLowerCase())) {
            item.click();
            return;
          }
        }
      }, creatorName);
    } else if (!convAberta) {
      throw new Error(`[Assinante BR] Conversa "${creatorName}" não encontrada`);
    }

    // Aguarda as mensagens carregarem
    await pageAssinante.waitForFunction(() => {
      const root = document.querySelector('#privacy-web-chat')?.shadowRoot;
      return !!(root?.querySelector('.vac-message-container'));
    }, { timeout: 15000 });
    await pageAssinante.waitForTimeout(2000);

    // 2.2 — Encontra a mensagem de videochamada e clica em Confirmar pagamento
    console.log('🔍 [Assinante BR] Buscando mensagem de videochamada e clicando em Confirmar...');
    await pageAssinante.screenshot({ path: 'screenshots/debug-assinante-conversa.png' });

    const btnPagamentoClicado = await pageAssinante.evaluate(() => {
      const chatRoot = document.querySelector('#privacy-web-chat')?.shadowRoot;
      if (!chatRoot) return 'sem chatRoot';

      // Botão "Efetuar pagamento" — aparece acima da mensagem de videochamada
      const allBtns = [...chatRoot.querySelectorAll('button, .el-button, [role="button"]')];
      for (const btn of allBtns) {
        const txt = (btn.textContent || '').trim().toLowerCase();
        if (/efetuar pagamento|confirmar pagamento|pagar|pay now/i.test(txt) && btn.offsetParent !== null) {
          btn.click();
          return `clicado: "${btn.textContent?.trim()}"`;
        }
      }

      // Fallback: procura dentro da mensagem de videochamada
      for (const msg of chatRoot.querySelectorAll('.vac-message-container, .vac-message-card')) {
        const txt = (msg.textContent || '').toLowerCase();
        if (!txt.includes('videochamada') && !txt.includes('solicitação')) continue;
        const btns = [...msg.querySelectorAll('button, .el-button')];
        for (const btn of btns) {
          if (btn.offsetParent !== null) {
            btn.click();
            return `clicado fallback: "${btn.textContent?.trim()}"`;
          }
        }
      }
      return 'botao nao encontrado';
    });

    console.log(`🖱️  [Assinante BR] Ação na mensagem: ${btnPagamentoClicado}`);
    await pageAssinante.waitForTimeout(3000);
    await pageAssinante.screenshot({ path: 'screenshots/debug-assinante-apos-clique.png' });

    // 2.3 — Captura o valor exibido no modal de pagamento
    console.log('💰 [Assinante BR] Capturando valor no modal de pagamento...');
    const valorNoModal = await pageAssinante.evaluate(() => {
      function findOverlay(root, text) {
        for (const o of root.querySelectorAll('.el-overlay, .el-dialog')) {
          if ((o.textContent || '').toLowerCase().includes(text)) return o;
        }
        for (const h of [...root.querySelectorAll('*')].filter(e => e.shadowRoot)) {
          const r = findOverlay(h.shadowRoot, text);
          if (r) return r;
        }
        return null;
      }

      // Busca o valor no campo "Valor" do modal de pagamento
      // Estrutura esperada: label "Valor" → próximo elemento com "R$ XX,XX"
      function extrairValorDoPagamento(root) {
        const allEls = [...root.querySelectorAll('*')];

        // Estratégia 1: acha o elemento com texto "Valor" e pega o irmão/filho seguinte
        for (const el of allEls) {
          if (el.children.length === 0 && el.textContent?.trim().toLowerCase() === 'valor') {
            // Tenta o próximo irmão
            const next = el.nextElementSibling;
            if (next) {
              const txt = next.textContent?.trim();
              if (/R\$/.test(txt) && /\d/.test(txt)) return txt;
            }
            // Tenta o pai e depois o próximo elemento com R$
            const parent = el.parentElement;
            const parentNext = parent?.nextElementSibling;
            if (parentNext) {
              const txt = parentNext.textContent?.trim();
              if (/R\$/.test(txt) && /\d/.test(txt)) return txt;
            }
          }
        }

        // Estratégia 2: busca o elemento com R$ que NÃO é saldo de carteira
        // (ignora elementos que contenham "saldo", "carteira", "usar saldo")
        for (const el of allEls) {
          if (el.tagName.toLowerCase() === 'style' || el.tagName.toLowerCase() === 'script') continue;
          if (el.children.length === 0) {
            const txt = (el.textContent || '').trim();
            if (/R\$/.test(txt) && /\d/.test(txt) && txt.length < 20) {
              // Verifica se o contexto pai NÃO é relacionado à carteira
              const parentTxt = (el.parentElement?.textContent || '').toLowerCase();
              if (!parentTxt.includes('saldo') && !parentTxt.includes('carteira') && !parentTxt.includes('usar')) {
                return txt;
              }
            }
          }
        }
        return null;
      }

      // 1. Componente privacy-web-payment (shadow DOM)
      const paymentEl = document.querySelector('privacy-web-payment');
      if (paymentEl?.shadowRoot) {
        const val = extrairValorDoPagamento(paymentEl.shadowRoot);
        if (val) return val;
      }

      // 2. Overlays com "solicitação de videochamada" ou "formas de pagamento"
      const payOverlay =
        findOverlay(document, 'formas de pagamento') ||
        findOverlay(document, 'solicitação de videochamada') ||
        findOverlay(document, 'pagamento');
      if (payOverlay) {
        const val = extrairValorDoPagamento(payOverlay);
        if (val) return val;
      }

      return null;
    });

    console.log(`💰 [Assinante BR] Valor no modal de pagamento: "${valorNoModal}"`);

    // Evidência: print do modal de pagamento aberto na conta do assinante BR
    const screenshotModalPath = `screenshots/assinante-modal-pagamento-${Date.now()}.png`;
    await pageAssinante.screenshot({ path: screenshotModalPath });
    try {
      const { uploadScreenshot } = await import('../services/s3.services.js');
      const s3Url = await uploadScreenshot(screenshotModalPath);
      console.log(`📸 [Assinante BR] Evidência do modal de pagamento: ${s3Url}`);
    } catch (err) {
      console.warn('Aviso: upload do screenshot de evidência falhou:', err?.message);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // VALIDAÇÃO — Detecção do bug de conversão de moeda no modal de pagamento
    // ═══════════════════════════════════════════════════════════════════════
    if (!valorNoModal) {
      throw new Error(
        '[Assinante BR] Valor não encontrado no modal de pagamento.\n' +
        'Verifique os screenshots em screenshots/debug-assinante-*.png'
      );
    }

    const digitosModal = valorNoModal.replace(/[^\d]/g, '');
    const digitosARS   = String(VALOR_BRUTO_ARS).replace(/[^\d]/g, '');
    const mesmosDigitos = digitosModal === digitosARS;
    const temBRL        = /R\$|BRL/i.test(valorNoModal);

    if (mesmosDigitos) {
      throw new Error(
        `🐛 BUG DE CONVERSÃO DETECTADO NO MODAL DE PAGAMENTO!\n` +
        `   Criador AR definiu: ${CALL_PRICE_ARS} ARS\n` +
        `   Assinante BR viu no pagamento: "${valorNoModal}"\n` +
        `   Valor numérico idêntico — conversão ARS → BRL não foi aplicada.`
      );
    }

    if (!temBRL) {
      throw new Error(
        `💱 MOEDA INCORRETA NO MODAL DE PAGAMENTO!\n` +
        `   Esperado: R$ (BRL)\n` +
        `   Exibido:  "${valorNoModal}"\n` +
        `   O valor deve ser convertido para BRL na tela de pagamento do assinante.`
      );
    }

    console.log(`✅ Conversão OK no modal de pagamento: ${CALL_PRICE_ARS} ARS → "${valorNoModal}"`);

  } finally {
    await browserAssinante.close();
  }

  const totalTime = Date.now() - startTime;
  return {
    flow: 'Chamada 1:1 - Conversão de Moeda',
    totalTime,
    status: 'ok',
    detalhe: `Criador AR enviou ${CALL_PRICE_ARS} ARS → valor exibido em BRL ao assinante.`,
  };
};

export default chamadaUmParaUmFlow;
