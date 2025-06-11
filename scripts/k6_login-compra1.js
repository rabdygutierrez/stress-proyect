import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

// === MÉTRICAS PERSONALIZADAS ===
const authDuration = new Trend('authentication_duration');
const infoUserDuration = new Trend('info_user_duration');
const accessTokenDuration = new Trend('access_token_duration');
const liveAuthDuration = new Trend('live_auth_duration');
const newSessionDuration = new Trend('new_session_duration');

const authFailures = new Rate('authentication_failures');
const infoUserFailures = new Rate('info_user_failures');
const accessTokenFailures = new Rate('access_token_failures');
const liveAuthFailures = new Rate('live_auth_failures');
const newSessionFailures = new Rate('new_session_failures');

// === CARGA DE USUARIOS ===
const users = new SharedArray('usuarios', () => {
  return JSON.parse(open('./users_10.json')).usuarios.slice(0, 5); // Solo 5 usuarios
});

// === CONFIGURACIÓN ===
export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

// === TEST FLOW ===
export default function () {
  const user = users[__VU % users.length];
  if (!user) {
    console.warn("⚠️ Usuario no válido");
    return;
  }

  let jsessionid = '';
  let sessionToken = '';
  let userInfo = null;
  let userAccessToken = '';
  const customerId = 671;
  let userId = '';
  let userEmail = '';

  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org',
    'Referer': 'https://portaltest.harvestful.org/',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  };

  // 1. Authenticate
  group('1. Authenticate - /authenticate', () => {
    const payload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate',
      payload,
      { headers: headersBase }
    );

    authDuration.add(res.timings.duration);

    if (!check(res, { 'auth status 200': (r) => r.status === 200 })) {
      authFailures.add(1);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch {
      authFailures.add(1);
      return;
    }

    if (!check(json, { 'auth token exists': (j) => !!j.result?.token })) {
      authFailures.add(1);
      return;
    }

    sessionToken = json.result.token;
    jsessionid = res.cookies['JSESSIONID']?.[0]?.value || '';
  });

  // 2. Info User
  group('2. Info User - /infoUser', () => {
    if (!sessionToken || !jsessionid) {
      infoUserFailures.add(1);
      return;
    }

    const payload = JSON.stringify({ token: sessionToken });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser',
      payload,
      {
        headers: {
          ...headersBase,
          'Accept': 'application/json',
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    infoUserDuration.add(res.timings.duration);

    if (!check(res, { 'infoUser status 200': (r) => r.status === 200 })) {
      infoUserFailures.add(1);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch {
      infoUserFailures.add(1);
      return;
    }

    if (!check(json, { 'user id and email exist': (j) => !!j.result?.user?.id && !!j.result?.user?.email })) {
      infoUserFailures.add(1);
      return;
    }

    userInfo = json.result;
    userId = json.result.user.id;
    userEmail = json.result.user.email;
  });

  // 3. Get User Access Token
  group('3. Get User Access Token - /getUserAccessToken', () => {
    if (!sessionToken || !userEmail || !customerId) {
      accessTokenFailures.add(1);
      return;
    }

    const payload = JSON.stringify({
      token: sessionToken,
      customerId: customerId,
      email: userEmail,
    });

    // Aquí usamos Authorization Bearer en headers, que es estándar para tokens
    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
      payload,
      {
        headers: {
          ...headersBase,
          'Accept': 'application/json',
          'Cookie': `JSESSIONID=${jsessionid}`,
          'Authorization': `Bearer ${sessionToken}`, // Posible corrección importante
        },
      }
    );

    accessTokenDuration.add(res.timings.duration);

    if (!check(res, { 'getUserAccessToken status 200': (r) => r.status === 200 })) {
      accessTokenFailures.add(1);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch {
      accessTokenFailures.add(1);
      return;
    }

    if (!check(json, { 'user access token exists': (j) => !!j.result?.user_access_token })) {
      accessTokenFailures.add(1);
      return;
    }

    userAccessToken = json.result.user_access_token;
  });

  // 4. Live Auth
  group('4. Live Auth - /app-services-live/auth', () => {
    if (!userAccessToken) {
      liveAuthFailures.add(1);
      return;
    }

    const payload = JSON.stringify({ token: userAccessToken });

    const extraHeaders = {
      ...headersBase,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Cookie': `JSESSIONID=${jsessionid}`,
      Origin: 'https://livetest.harvestful.org',
      Referer: 'https://livetest.harvestful.org/',
      'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      Priority: 'u=1, i',
    };

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-live/auth',
      payload,
      { headers: extraHeaders }
    );

    liveAuthDuration.add(res.timings.duration);

    if (!check(res, { 'live auth status 200': (r) => r.status === 200 })) {
      liveAuthFailures.add(1);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch {
      liveAuthFailures.add(1);
      return;
    }

    if (!check(json, { 'live auth success': (j) => j.returnCode === 0 })) {
      liveAuthFailures.add(1);
      return;
    }
  });

  // 5. New Session
  group('5. New Session - /app-services-live/newSession', () => {
    if (!userAccessToken || !userId) {
      newSessionFailures.add(1);
      return;
    }

    const payload = JSON.stringify({
      token: userAccessToken,
      customerId: customerId,
      userId: userId,
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-live/newSession',
      payload,
      {
        headers: {
          ...headersBase,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Cookie: `JSESSIONID=${jsessionid}`,
          Origin: 'https://livetest.harvestful.org',
          Referer: 'https://livetest.harvestful.org/',
        },
      }
    );

    newSessionDuration.add(res.timings.duration);

    if (!check(res, { 'newSession status 200': (r) => r.status === 200 })) {
      newSessionFailures.add(1);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch {
      newSessionFailures.add(1);
      return;
    }

    if (!check(json, { 'privateIP exists': (j) => !!j.result?.privateIP })) {
      newSessionFailures.add(1);
      return;
    }
  });

  sleep(1);
}
