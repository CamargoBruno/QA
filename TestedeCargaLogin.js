import http from "k6/http";
import { check, sleep } from "k6";
import { htmlReport } from "https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js";

// Perfil canário (leve) p/ PROD
export const options = {
  scenarios: {
    canary: {
      executor: "constant-arrival-rate",
      rate: 6,              // 6 req/min
      timeUnit: "1m",
      duration: "2m",
      preAllocatedVUs: 2,
      maxVUs: 5,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.02"],
    http_req_duration: ["p(95)<1500"],
    checks: ["rate>0.90"],
  },
};

const SIGNIN_URL   = "https://privacy.com.br/auth?route=sign-in";
const AUTH_URL     = __ENV.AUTH_URL || "";        // ex.: https://service.privacy.com.br/api/auth/login
const EMAIL        = __ENV.EMAIL || "";
const PASSWORD     = __ENV.PASSWORD || "";
const PROTECTED_URL= __ENV.PROTECTED_URL || "";   // ex.: https://service.privacy.com.br/api/me

function isJSON(res) {
  return String(res.headers["Content-Type"] || "").includes("application/json");
}

function tryApiLogin() {
  if (!AUTH_URL) {
    // Sem endpoint de API: pula login (evita '#<nil>')
    return { skipped: true };
  }

  // 1) tenta JSON
  const jsonRes = http.post(
    AUTH_URL,
    JSON.stringify({ email: EMAIL, password: PASSWORD }),
    { headers: { "Content-Type": "application/json", "Accept": "application/json" }, redirects: 0 }
  );

  const okJson = [200,201,302,303,307,308].includes(jsonRes.status);
  let token = null;
  try { if (isJSON(jsonRes)) { const d = jsonRes.json(); token = d?.token || d?.access_token || d?.jwt || null; } } catch (_) {}
  let hasCookie = Object.values(jsonRes.cookies || {}).some(arr => arr.some(c => /session|auth|sid|jwt/i.test(c.name || "")));

  if (okJson && (token || hasCookie || isJSON(jsonRes))) {
    return { skipped: false, res: jsonRes, token };
  }

  // 2) fallback: x-www-form-urlencoded (caso a API exija)
  const formRes = http.post(
    AUTH_URL,
    { email: EMAIL, password: PASSWORD },
    { headers: { "Content-Type": "application/x-www-form-urlencoded" }, redirects: 0 }
  );

  hasCookie = Object.values(formRes.cookies || {}).some(arr => arr.some(c => /session|auth|sid|jwt/i.test(c.name || "")));
  return { skipped: false, res: formRes, token: null, hasCookie };
}

export default function () {
  // A) Saúde da página de login (GET)
  const page = http.get(SIGNIN_URL, { headers: { "User-Agent": "k6-prod-canary" } });
  check(page, {
    "login page 200": (r) => r.status === 200,
    "retornou HTML":  (r) => String(r.headers["Content-Type"]||"").includes("text/html"),
  });

  // B) Login via API (opcional)
  const login = tryApiLogin();
  if (!login.skipped) {
    const okStatus = [200,201,302,303,307,308].includes(login.res?.status || 0);
    const hasCookie = login.hasCookie || Object.values(login.res?.cookies || {}).some(arr => arr.some(c => /session|auth|sid|jwt/i.test(c.name || "")));

    check(login.res, {
      "login status ok":     () => okStatus,
      "token ou cookie ok":  () => !!login.token || hasCookie,
    });

    // C) Rota protegida (se informada)
    if (okStatus && PROTECTED_URL) {
      const hdr = login.token ? { headers: { Authorization: `Bearer ${login.token}` } } : {};
      const me = http.get(PROTECTED_URL, hdr);
      check(me, { "rota protegida 200": (r) => r.status === 200 });
    }
  }

  sleep(1);
}

// Relatórios (HTML + JSON)
export function handleSummary(data) {
  return {
    "resultado_login.html": htmlReport(data),
    "resultado_login.json": JSON.stringify(data, null, 2),
  };
}
