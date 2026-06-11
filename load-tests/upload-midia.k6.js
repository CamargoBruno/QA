import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = 'https://service.privacy.com.br';
const CAPTCHA_TOKEN = __ENV.CAPTCHA_TOKEN;
const TEST_EMAIL = __ENV.TEST_EMAIL;
const TEST_PASSWORD = __ENV.TEST_PASSWORD;

const TEST_IMAGE = open('./assets/test.jpg', 'b');

export const options = {
  stages: [
    { duration: '1m', target: 10 },  // ramp up inicial
    { duration: '2m', target: 10 },  // hold
    { duration: '2m', target: 30 },  // ramp up stress
    { duration: '10m', target: 30 }, // hold stress (~15k iterações)
    { duration: '1m', target: 0 },   // ramp down
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    'http_req_duration{name:createUploadUrl}': ['p(95)<3000'],
    'http_req_duration{name:s3Upload}': ['p(95)<10000'],
  },
};

export function setup() {
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
    }
  );

  check(res, { 'login 200': (r) => r.status === 200 });

  return { token: res.json('token') };
}

function randomHex(length) {
  const chars = '0123456789abcdef';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

export default function (data) {
  const token = data.token;

  // 1. Solicitar URL de upload
  const createRes = http.post(
    `${BASE_URL}/media/temporary/createUploadUrl`,
    JSON.stringify({
      fileName: `load-test-vu${__VU}-iter${__ITER}`,
      extension: 'jpg',
      type: 'image/jpeg',
      profileName: 'Bcnc',
      fileHash: randomHex(64),
      time: '',
      width: 1,
      height: 1,
      FileSize: TEST_IMAGE.byteLength,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      tags: { name: 'createUploadUrl' },
    }
  );

  check(createRes, {
    'createUploadUrl 200': (r) => r.status === 200,
    'retornou URL de upload': (r) => r.json('url') !== null,
  });

  const uploadUrl = createRes.json('url');

  if (!uploadUrl) {
    sleep(1);
    return;
  }

  // 2. Fazer upload do arquivo para o S3
  const putRes = http.put(uploadUrl, TEST_IMAGE, {
    headers: { 'Content-Type': 'image/jpeg' },
    tags: { name: 's3Upload' },
  });

  check(putRes, { 's3 upload 200': (r) => r.status === 200 });

  sleep(1);
}
