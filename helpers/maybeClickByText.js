export const maybeClickByText = async (page, re) => {
  try {
    const buttons = await page.locator('button, [role="button"]').all();
    
    for (const button of buttons) {
      const text = await button.textContent();
      if (text && re.test(text.trim())) {
        await button.click({ force: true });
        return true;
      }
    }
    return false;
  } catch (error) {
    return false;
  }
};