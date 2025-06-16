import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';

// Métricas personalizadas
const authenticateDuration = new Trend('authenticate_duration');
const infoUserDuration = new Trend('infoUser_duration');
const getUserAccessTokenDuration = new Trend('getUserAccessToken_duration');
const liveSessionDuration = new Trend('liveSession_duration');
const newSessionDuration = new Trend('newSession_duration');

// Carga de usuarios
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./usuarios_5566.json')).usuarios
);

// Configuración del escenario de carga progresiva
export const options = {
  scenarios: {
    user_live_event_presence: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '30s', target: 20 },
        { duration: '30s', target: 30 },
        { duration: '30s', target: 40 },
        { duration: '30s', target: 50 },
        { duration: '30s', target: 60 },
        { duration: '30s', target: 70 },
        { duration: '30s', target: 80 },
        { duration: '30s', target: 90 },
        { duration: '30s', target: 100 },
        { duration: '30s', target: 110 },
        { duration: '30s', target: 120 },
        { duration: '30s', target: 130 },
        { duration: '30s', target: 140 },
        { duration: '30s', target: 150 },
        { duration: '30s', target: 160 },
        { duration: '30s', target: 170 },
        { duration: '30s', target: 180 },
        { duration: '30s', target: 190 },
        { duration: '30s', target: 200 },
        { duration: '30s', target: 210 },
        { duration: '30s', target: 220 },
        { duration: '30s', target: 230 },
        { duration: '30s', target: 240 },
        { duration: '30s', target: 250 },
        { duration: '30s', target: 260 },
        { duration: '30s', target: 270 },
        { duration: '30s', target: 280 },
        { duration: '30s', target: 290 },
        { duration: '30s', target: 300 },
        { duration: '30s', target: 310 },
        { duration: '30s', target: 320 },
        { duration: '30s', target: 330 },
        { duration: '30s', target: 340 },
        { duration: '30s', target: 350 },
        { duration: '30s', target: 360 },
        { duration: '30s', target: 370 },
        { duration: '30s', target: 380 },
        { duration: '30s', target: 390 },
        { duration: '30s', target: 400 },
        { duration: '30s', target: 410 },
        { duration: '30s', target: 420 },
        { duration: '30s', target: 430 },
        { duration: '30s', target: 440 },
        { duration: '30s', target: 450 },
        { duration: '30s', target: 460 },
        { duration: '30s', target: 470 },
        { duration: '30s', target: 480 },
        { duration: '30s', target: 490 },
        { duration: '30s', target: 500 },
        { duration: '2h', target: 500 },
      ],
    },
  },
};

export default function () {
  const user = users[__VU % users.length];

  // --- Authenticate ---
  const authPayload = JSON.stringify({
    email: user.email,
    password: user.password,
  });

  const authRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/authenticate',
    authPayload,
    { headers: { 'Content-Type': 'application/json' } }
  );
  authenticateDuration.add(authRes.timings.duration);

  check(authRes, {
    'authenticate status 200': (r) => r.status === 200,
    'token exists': (r) => !!r.json('result.token'),
  });

  const token = authRes.json('result.token');
  const privateIP = authRes.json('result.privateIP');
  const jsessionMatch = (authRes.headers['Set-Cookie'] || '').match(/JSESSIONID=([^;]+);/);
  const jsessionId = jsessionMatch ? jsessionMatch[1] : null;

  if (!token || !jsessionId) return;
  sleep(1);

  // --- InfoUser ---
  const infoPayload = JSON.stringify({ token });

  const infoRes = http.post(
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

  const info = infoRes.json();
  const customerId = info.result?.purchasedEvents?.[0]?.en?.[0]?.customer_id || null;
  const userId = info.result?.user?.id || null;

  if (!customerId || !userId) return;
  sleep(1);

  // --- GetUserAccessToken ---
  const accessTokenPayload = JSON.stringify({
    email: user.email,
    customer_id: customerId,
  });

  const accessTokenRes = http.post(
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
    'user_access_token exists': (r) => !!r.json('result.user_access_token'),
  });

  const user_access_token = accessTokenRes.json('result.user_access_token');
  sleep(1);

  // --- LiveSession ---
  const livePayload = JSON.stringify({ token: user_access_token });

  const liveRes = http.post(
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
  sleep(1);

  // --- NewSession ---
  const newSessionPayload = JSON.stringify({
    token: user_access_token,
    customerId: customerId,
    userId: userId,
  });

  const newSessionRes = http.post(
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

  sleep(1);
}
