import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend } from 'k6/metrics';

// === MÉTRICAS ===
const infoUserDuration = new Trend('infoUser_duration');
const newSessionDuration = new Trend('newSession_duration');

// === CARGA DE USUARIOS (sólo 5) ===
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10.json')).usuarios.slice(0, 5)
);

// === CONFIGURACIÓN ===
export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

// === FUNCIÓN PRINCIPAL ===
export default function () {
  const user = users[__VU % users.length];
  console.log(`🔐 Autenticando usuario: ${user.email}`);

  // 1. AUTHENTICATE
  const authRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/authenticate',
    JSON.stringify({
      email: user.email,
      password: user.password,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://portaltest.harvestful.org',
        'Referer': 'https://portaltest.harvestful.org/',
      },
    }
  );

  check(authRes, {
    'auth success': (res) => res.status === 200,
  });

  let authJson;
  try {
    authJson = authRes.json();
  } catch (e) {
    console.error(`❌ ERROR parsing AUTH response: ${e}`);
    console.error(authRes.body);
    return;
  }

  const authToken = authJson?.result?.token;
  const jsessionid = authRes.cookies?.JSESSIONID?.[0]?.value;

  if (!authToken || !jsessionid) {
    console.error(`❌ Token o JSESSIONID no encontrado`);
    return;
  }

  console.log(`✅ AUTH token: ${authToken}`);
  console.log(`🍪 JSESSIONID: ${jsessionid}`);

  // 2. INFO USER
  const infoRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/infoUser',
    JSON.stringify({ token: authToken }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `JSESSIONID=${jsessionid}`,
        'Origin': 'https://portaltest.harvestful.org',
        'Referer': 'https://portaltest.harvestful.org/',
      },
    }
  );

  infoUserDuration.add(infoRes.timings.duration);

  let infoJson;
  try {
    if (!infoRes.headers['Content-Type'].includes('application/json')) {
      throw new Error('Response no es JSON');
    }
    infoJson = infoRes.json();
  } catch (e) {
    console.error(`❌ Error en infoUser: ${e}`);
    console.error(infoRes.body);
    return;
  }

  const customerId = infoJson?.result?.customerId;
  const userId = infoJson?.result?.userId;

  if (!customerId || !userId) {
    console.error(`🧑‍💼 userId: ${userId} | customerId: ${customerId}`);
    return;
  }

  console.log(`🧑‍💼 userId: ${userId} | customerId: ${customerId}`);

  // 3. GET ACCESS TOKEN
  const accessRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
    JSON.stringify({
      email: user.email,
      customer_id: customerId,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `JSESSIONID=${jsessionid}`,
        'Origin': 'https://portaltest.harvestful.org',
        'Referer': 'https://portaltest.harvestful.org/',
      },
    }
  );

  let accessJson;
  try {
    accessJson = accessRes.json();
  } catch (e) {
    console.error(`❌ ERROR parsing AccessToken response: ${e}`);
    console.error(accessRes.body);
    return;
  }

  const eventAccessToken = accessJson?.result?.token;
  if (!eventAccessToken) {
    console.error(`❌ No se obtuvo eventAccessToken`);
    return;
  }

  // 4. NEW SESSION
  const newSessionRes = http.post(
    'https://appservicestest.harvestful.org/app-services-live/newSession',
    JSON.stringify({
      token: eventAccessToken,
      customerId: customerId,
      userId: userId,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Cookie': `JSESSIONID=${jsessionid}`,
        'Origin': 'https://livetest.harvestful.org',
        'Referer': 'https://livetest.harvestful.org/',
      },
    }
  );

  newSessionDuration.add(newSessionRes.timings.duration);

  check(newSessionRes, {
    'newSession success': (res) => res.status === 200,
  });

  // 💤 Sleep por realismo
  sleep(1);
}
