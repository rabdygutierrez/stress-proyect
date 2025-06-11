import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

let loginDuration = new Trend('login_duration');
let failureRate = new Rate('failures');

// Leer usuarios
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10.json')).usuarios.slice(0, 5)
);

export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

export default function () {
  const user = users[__VU % users.length];
  console.log(`🔐 Autenticando usuario: ${user.email}`);

  // Paso 1: Authenticate
  const authRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/authenticate',
    JSON.stringify({ email: user.email, password: user.password }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://portaltest.harvestful.org',
      },
    }
  );

  const authJson = JSON.parse(authRes.body);
  const authToken = authJson.result?.token;
  const jsession = authRes.cookies?.JSESSIONID?.[0]?.value || '';

  console.log(`✅ AUTH token: ${authToken}`);
  console.log(`🍪 JSESSIONID: ${jsession}`);

  check(authRes, {
    'auth 200': (r) => r.status === 200,
    'auth has token': () => !!authToken,
  }) || failureRate.add(1);

  // Paso 2: infoUser
  const infoRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/infoUser',
    JSON.stringify({ token: authToken }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://portaltest.harvestful.org',
        Cookie: `JSESSIONID=${jsession}`,
      },
    }
  );

  const infoJson = JSON.parse(infoRes.body);
  const userId = infoJson.result?.id;
  const customerId = infoJson.result?.customerId;

  console.log(`🧑‍💼 userId: ${userId} | customerId: ${customerId}`);

  check(infoRes, {
    'infoUser 200': (r) => r.status === 200,
    'infoUser OK': () => !!userId && !!customerId,
  }) || failureRate.add(1);

  // Paso 3: getUserAccessToken
  const accessRes = http.post(
    'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
    JSON.stringify({
      email: user.email,
      customer_id: customerId,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://portaltest.harvestful.org',
        Cookie: `JSESSIONID=${jsession}`,
      },
    }
  );

  const accessToken = JSON.parse(accessRes.body)?.result?.eventAccessToken;
  console.log(`🎟️ Event Access Token: ${accessToken}`);

  check(accessRes, {
    'accessToken 200': (r) => r.status === 200,
    'accessToken exists': () => !!accessToken,
  }) || failureRate.add(1);

  // Paso 4: auth LIVE
  const authLive = http.post(
    'https://appservicestest.harvestful.org/app-services-live/auth',
    JSON.stringify({ token: accessToken }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://livetest.harvestful.org',
        Cookie: `JSESSIONID=${jsession}`,
      },
    }
  );

  console.log(`🌐 Live auth status: ${authLive.status}`);

  // Paso 5: newSession
  const sessionRes = http.post(
    'https://appservicestest.harvestful.org/app-services-live/newSession',
    JSON.stringify({
      token: accessToken,
      customerId: customerId,
      userId: userId,
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://livetest.harvestful.org',
        Cookie: `JSESSIONID=${jsession}`,
      },
    }
  );

  console.log(`🆕 newSession status: ${sessionRes.status}`);
  console.log(`📊 Fin del flujo para: ${user.email}`);

  check(sessionRes, {
    'newSession 200': (r) => r.status === 200,
  }) || failureRate.add(1);

  loginDuration.add(authRes.timings.duration);
  sleep(1);
}
