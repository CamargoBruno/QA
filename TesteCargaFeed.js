import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 150, // 150 usuários simultâneos
  duration: '1m', // por 1 minuto
  thresholds: {
    http_req_duration: ['p(90)<1000'], // 90% das respostas devem ser < 1s
    http_req_failed: ['rate<0.01'],    // menos de 1% de falhas
  },
};

export default function () {
  const res = http.get('https://web-dev.privacy.com.br/api/feed');

  check(res, {
    'status é 200': (r) => r.status === 200,
    'resposta é rápida': (r) => r.timings.duration < 1000,
  });

  sleep(1); // espera 1s entre cada requisição por usuário
}