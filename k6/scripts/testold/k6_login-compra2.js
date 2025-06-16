import { SharedArray } from 'k6/data';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// Cargar usuarios desde el JSON usando SharedArray
const users = new SharedArray('users', () => {
  return JSON.parse(open('/k6/scripts/data/users.json')).usuarios;
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
    vus: 10,
    duration: '30s'
  },
};

// Configurar opciones dinámicamente según el tipo de prueba
export const options = __ENV.TYPE_TEST && testTypes[__ENV.TYPE_TEST]
  ? { stages: [{ duration: testTypes[__ENV.TYPE_TEST].duration, target: testTypes[__ENV.TYPE_TEST].vus }] }
  : { stages: [{ duration: '30s', target: 10 }, { duration: '1m', target: 10 }, { duration: '30s', target: 0 }] };

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
  const customerId = infoBody.result?.purchasedEvents?.[0]?.en?.[0]?.customer_id || null;
  const userId = infoBody.result?.user?.id || null;

  if (!customerId || !userId) {
    infoUserErrors.add(1);
    console.error(`❌ No se encontró customer_id o userId para ${user.email}`);
    return;
  }

  sleep(1);

  // --- getUserAccessToken ---
  const accessTokenPayload = JSON.stringify({
    email: user.email,
    customer_id: customerId,
  });

  let accessTokenRes = http.post(
    `${BASE_URL}/app-services-home/getUserAccessToken`,
    accessTokenPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Private-IP': privateIP,
        'Cookie': `JSESSIONID=${jsessionId}`,
      },
    }
  );
  getUserAccessTokenDuration.add(accessTokenRes.timings.duration);

  check(accessTokenRes, {
    'getUserAccessToken status 200': (r) => r.status === 200,
    'user access token exists': (r) => !!r.json('result.user_access_token'),
  });

  if (accessTokenRes.status !== 200) {
    accessTokenErrors.add(1);
    console.error(`❌ getUserAccessToken falló con status ${accessTokenRes.status} para ${user.email}`);
    return;
  }

  const user_access_token = accessTokenRes.json('result.user_access_token');

  sleep(1);

  // --- liveSession ---
  const livePayload = JSON.stringify({
    token: user_access_token,
  });

  let liveRes = http.post(
    `${BASE_URL}/app-services-live/auth`,
    livePayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Private-IP': privateIP,
        'Cookie': `JSESSIONID=${jsessionId}`,
      },
    }
  );
  liveSessionDuration.add(liveRes.timings.duration);

  check(liveRes, {
    'liveSession status 200': (r) => r.status === 200,
  });

  if (liveRes.status !== 200) {
    liveSessionErrors.add(1);
    console.error(`❌ liveSession falló con status ${liveRes.status} para ${user.email}`);
    return;
  }

  sleep(1);

  // --- newSession ---
  const newSessionPayload = JSON.stringify({
    token: user_access_token,
    customerId: customerId,
    userId: userId,
  });

  let newSessionRes = http.post(
    `${BASE_URL}/app-services-live/newSession`,
    newSessionPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Private-IP': privateIP,
        'Cookie': `JSESSIONID=${jsessionId}`,
      },
    }
  );
  newSessionDuration.add(newSessionRes.timings.duration);

  check(newSessionRes, {
    'newSession status 200': (r) => r.status === 200,
  });

  if (newSessionRes.status !== 200) {
    newSessionErrors.add(1);
    console.error(`❌ newSession falló con status ${newSessionRes.status} para ${user.email}`);
    return;
  }

  sleep(1);
}