describe('Validação de imagens .webp na plataforma', () => {
  it('Deve fazer login e validar que as imagens estão em .webp', () => {
    cy.visit('https://web-dev.privacy.com.br/auth?route=sign-in');

    // Aguarda o input de e-mail com placeholder "Email/CPF"
    cy.get('input[placeholder="Email/CPF"]', { timeout: 10000 })
      .should('be.visible')
      .type('bcncamargo@hotmail.com');

    // Aguarda o input de senha com placeholder "Senha"
    cy.get('input[placeholder="Senha"]', { timeout: 10000 })
      .should('be.visible')
      .type('Chico1611!');

    // Clica no botão Entrar
    cy.contains('button', 'Entrar').click();

    // Aguarda a URL mudar
    cy.url({ timeout: 15000 }).should('not.include', 'sign-in');
    cy.wait(3000);

    // Valida imagens visíveis em formato .webp
    cy.get('img:visible').each(($img) => {
      const src = $img.attr('src');
      if (src) {
        cy.log(`Imagem: ${src}`);
        expect(src).to.match(/\.webp(\?.*)?$/);
      }
    });
  });
});


