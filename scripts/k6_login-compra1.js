import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// === MÉTRICAS PERSONALIZADAS ===
let loginFailRate = new Rate('login_fail_rate');
let loginDuration = new Trend('login_duration');
let loginSuccessCount = new Counter('login_success_count');
const infoUserDuration = new Trend('infoUser_duration');
const getUserAccessTokenDuration = new Trend('getUserAccessToken_duration');
const liveSessionDuration = new Trend('liveSession_duration');
const newSessionDuration = new Trend('newSession_duration');

// === CARGA DE USUARIOS (sólo 5) ===
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10.json')).usuarios.slice(0, 5)
);

// === CONFIGURACIÓN DE PRUEBA ===
export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

export default function () {
  // Seleccionar un usuario aleatorio
  const user = users[Math.floor(Math.random() * users.length)];

  // --- authenticate ---
  const authPayload = JSON.stringify({
    email: user.email,
    password: user.password,
  });
  
  let authRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/authenticate',
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
    console.error('❌ No se obtuvo token o JSESSIONID, abortando...');
    return;
  }


  sleep(1);

  // --- infoUser ---
  const infoPayload = JSON.stringify({ token });

  let infoRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/infoUser',
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
    console.error(`❌ infoUser falló con status ${infoRes.status}`);
    return;
  }

  const infoBody = infoRes.json();
  const customerId = infoBody.result?.purchasedEvents?.[0]?.en?.[0]?.customer_id || null;
  const userId = infoBody.result?.user?.id || null;

  if (!customerId || !userId) {
    console.error('❌ No se encontró customer_id o userId en infoUser');
    return;
  }
  sleep(1);

  // --- getUserAccessToken ---
  const accessTokenPayload = JSON.stringify({
    email: 'v01100@mailinator.com',
    customer_id: customerId,
  });

  let accessTokenRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
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
  });

  if (accessTokenRes.status !== 200) {
    console.error(`❌ getUserAccessToken falló con status ${accessTokenRes.status}`);
    return;
  }

  sleep(1);
  check(accessTokenRes, {
    'authenticate status 200': (r) => r.status === 200,
    'authenticate token exists': (r) => !!r.json('result.user_access_token'),
  });

  const user_access_token = accessTokenRes.json('result.user_access_token');
  
  // --- liveSession ---
  const livePayload = JSON.stringify({
    token:user_access_token

  });
  let liveRes = http.post(
    'https://appservicestest.harvestful.org/app-services-live/auth',
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
    console.error(`❌ liveSession falló con status ${liveRes.status}`);
    return;
  }
  sleep(1);

  // --- newSession ---
  const newSessionPayload = JSON.stringify({
    token:user_access_token,
    customerId: customerId,
    userId: userId
  });
  let newSessionRes = http.post(
    'https://appservicestest.harvestful.org/app-services-live/newSession',
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
    console.error(`❌ newSession falló con status ${newSessionRes.status}`);
    return;
  }
  sleep(1);
}
