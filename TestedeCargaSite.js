import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10, // usuários virtuais simultâneos
  duration: '30s', // duração total do teste
};

export default function () {
  const res = http.get('https://web-dev.privacy.com.br');
  check(res, {
    'status é 200': (r) => r.status === 200,
  });
  sleep(1); // espera de 1 segundo entre requisições
}
