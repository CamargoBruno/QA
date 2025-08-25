import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10, // usuários simultâneos
  duration: '30s', // duração do teste
};

export default function () {
  const url = 'https://web-dev.privacy.com.br/api/auth/login';

  const payload = JSON.stringify({
    email: 'bcncamargo@hotmail.com',
    password: 'Chico1611!',
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'login retornou 200': (r) => r.status === 200,
    'token ou mensagem presente': (r) => r.body.includes('token') || r.body.includes('success'),
  });

  sleep(1);
}
