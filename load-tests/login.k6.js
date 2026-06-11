import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'https://service.privacy.com.br';
const CAPTCHA_TOKEN = __ENV.CAPTCHA_TOKEN;
const TEST_EMAIL = __ENV.TEST_EMAIL;
const TEST_PASSWORD = __ENV.TEST_PASSWORD;

export const options = {
  stages: [
    { duration: '1m', target: 10 },  // ramp up inicial
    { duration: '2m', target: 10 },  // hold
    { duration: '2m', target: 30 },  // ramp up stress
    { duration: '5m', target: 30 },  // hold stress
    { duration: '1m', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:login}': ['p(95)<2000'],
  },
};

export default function () {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      Email: TEST_EMAIL,
      Document: null,
      Password: TEST_PASSWORD,
      Locale: 'pt-BR',
      CanReceiveEmail: true,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'x-captcha-bypass-token': CAPTCHA_TOKEN,
      },
      tags: { name: 'login' },
    }
  );

  check(res, {
    'login 200': (r) => r.status === 200,
    'retornou token': (r) => !!r.json('token'),
  });

  sleep(1);
}
