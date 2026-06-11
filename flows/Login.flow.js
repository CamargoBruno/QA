import { login } from '../helpers/login.js';
import AppConfig from '../config/AppConfig.js';

const appConfig = new AppConfig();

const loginFlow = async (page) => {
  const startTime = Date.now();
  
  const email = appConfig.getEmail();
  const senha = appConfig.getPassword();
  
  await page.goto(appConfig.getSite());
  
  await login(page, email, senha);
  
  const totalTime = Date.now() - startTime;
  
  return {
    flow: 'Login Flow',
    totalTime,
    status: 'ok'
  };
};

export default loginFlow;
