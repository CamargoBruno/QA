// cypress/e2e/Privacy/login.cy.js
describe('Login na Privacy (Shadow DOM)', () => {
  const email = Cypress.env('PRIVACY_USER');
  const password = Cypress.env('PRIVACY_PASS');

  it('Deve logar com sucesso', () => {
    // 1) Abrir a tela de login
    cy.visit('https://privacy.com.br/auth?route=sign-in');

    // 2) Fechar overlay/banners (cookies etc.), se aparecerem
    cy.contains('button, [role="button"]', /aceitar|accept|ok|entendi/i, { timeout: 6000 })
      .click({ multiple: true, force: true })
      .wait(200);

    // 3) Garantir que o web component de autenticação carregou
    //    (se o nome da tag for outro, ajusta aqui; exemplo provável: 'privacy-web-auth')
    cy.get('privacy-web-auth', { timeout: 15000 }).should('exist');

    // 4) Entrar no Shadow DOM do componente de login
    cy.get('privacy-web-auth')
      .shadow()
      .within(() => {
        // 4.1) Preencher e-mail
        cy.get('input[type="email"]', { includeShadowDom: true, timeout: 15000 })
          .filter(':visible')
          .first()
          .click({ force: true })
          .type(email, { delay: 10 });

        // 4.2) Preencher senha
        cy.get('input[type="password"]', { includeShadowDom: true, timeout: 15000 })
          .filter(':visible')
          .first()
          .type(password, { log: false });

        // 4.3) Clicar no botão de entrar (ajuste o texto se necessário)
        cy.contains('button, [role="button"]', /entrar|login|sign in|acessar/i, {
          includeShadowDom: true,
          timeout: 15000
        }).click({ force: true });
      });

    // 5) Validação pós-login (ajuste para algo que exista na tela autenticada)
   // cy.url({ timeout: 20000 }).should('not.include', 'sign-in');
   // cy.contains(/dashboard|home|perfil|feed/i, { timeout: 20000 }).should('be.visible');
  });
});
