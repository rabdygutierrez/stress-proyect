import { SharedArray } from 'k6/data';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// Cargar usuarios desde el JSON usando SharedArray
const users = new SharedArray('users', () => {
  return JSON.parse(open('/k6/scripts/data/usuarios_5566.json')).usuarios;
});

// Base URL según el entorno
const BASE_URL = __ENV.ENV === 'QA' ? 'https://appservicestest.harvestful.org' : 'https://appservicestest.harvestful.org';

// Métricas
const authenticateDuration = new Trend('authenticate_duration');
const infoUserDuration = new Trend('infoUser_duration');
const getUserAccessTokenDuration = new Trend('getUserAccessToken_duration');
const liveSessionDuration = new Trend('liveSession_duration');
const newSessionDuration = new Trend('newSession_duration');
const authErrors = new Counter('auth_errors');
const infoUserErrors = new Counter('infoUser_errors');
const accessTokenErrors = new Counter('accessToken_errors');
const liveSessionErrors = new Counter('liveSession_errors');
const newSessionErrors = new Counter('newSession_errors');

// Definir tipos de prueba
export const testTypes = {
  smokeTest: {
    vus: 2000,
    duration: '10m'
  },
};

// Configurar opciones dinámicamente según el tipo de prueba
export const options = __ENV.TYPE_TEST && testTypes[__ENV.TYPE_TEST]
  ? { stages: [{ duration: testTypes[__ENV.TYPE_TEST].duration, target: testTypes[__ENV.TYPE_TEST].vus }] }
  : { stages: [
    { duration: '3m', target: 2000 }, 
    { duration: '10m', target: 1500 }, 
    { duration: '30s', target: 0 } 
  
  ] };

export default function () {
  // Seleccionar un usuario único por VU
  const user = users[__VU % users.length];

  // --- authenticate ---
  const authPayload = JSON.stringify({
    email: user.email,
    password: user.password,
  });

  let authRes = http.post(
    `${BASE_URL}/app-services-home/authenticate`,
    authPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );
  authenticateDuration.add(authRes.timings.duration);

  check(authRes, {
    'authenticate status 200': (r) => r.status === 200,
    'authenticate token exists': (r) => !!r.json('result.token'),
  });

  const token = authRes.json('result.token');
  const privateIP = authRes.json('result.privateIP');
  const setCookieHeader = authRes.headers['Set-Cookie'] || '';
  const jsessionMatch = setCookieHeader.match(/JSESSIONID=([^;]+);/);
  const jsessionId = jsessionMatch ? jsessionMatch[1] : null;

  if (!token || !jsessionId) {
    authErrors.add(1);
    console.error(`❌ No se obtuvo token o JSESSIONID para ${user.email}`);
    return;
  }

  sleep(1);

  // --- infoUser ---
  const infoPayload = JSON.stringify({ token });

  let infoRes = http.post(
    `${BASE_URL}/app-services-home/infoUser`,
    infoPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Private-IP': privateIP,
      },
    }
  );
  infoUserDuration.add(infoRes.timings.duration);

  check(infoRes, {
    'infoUser status 200': (r) => r.status === 200,
  });

  if (infoRes.status !== 200) {
    infoUserErrors.add(1);
    console.error(`❌ infoUser falló con status ${infoRes.status} para ${user.email}`);
    return;
  }

  const infoBody = infoRes.json();
  const customerId = infoBody.result?.purchasedEventsExpire?.[0]?.en?.[0]?.customer_id || null;
  const userId = infoBody.result?.user?.id || null;


}