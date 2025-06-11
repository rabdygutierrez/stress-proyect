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
  console.log("🚀 Nueva iteración de usuario");

  const user = users[__VU % users.length];
  if (!user) {
    console.warn("⚠️ Usuario no válido");
    return;
  }

  let jsessionid, sessionToken, userInfo, userAccessToken, customerId, userId;
  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org', 
    'Referer': 'https://portaltest.harvestful.org/', 
    'User-Agent': 'Mozilla/5.0',
  };

  // === AUTENTICACIÓN (1) ===
  group('1. Authenticate - /authenticate', () => {
    console.log(`🔐 Autenticando: ${user.email}`);
    const payload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const res = http.post('https://appservicestest.harvestful.org/app-services-home/authenticate',  payload, {
      headers: headersBase,
    });

    authDuration.add(res.timings.duration);

    const ok = check(res, {
      'Auth status is 200': (r) => r.status === 200,
      'Auth token received': (r) => !!r.json().result?.token,
    });

    if (!ok) {
      authFailures.add(1);
      console.error("❌ Falla en autenticación:", res.body);
      return;
    }

    sessionToken = res.json().result.token;
    customerId = res.json().result.customerId;
    userId = res.json().result.userId;
    jsessionid = res.cookies['JSESSIONID']?.[0]?.value || '';

    console.log("✅ Autenticación OK. Token:", sessionToken);
  });

  // === OBTENER INFO DEL USUARIO (2) ===
  group('2. Info User - /infoUser', () => {
    console.log("🧾 Obteniendo información del usuario...");

    const res = http.get('https://appservicestest.harvestful.org/app-services-home/infoUser',  {
      headers: {
        ...headersBase,
        'Cookie': `JSESSIONID=${jsessionid}`,
      },
    });

    infoUserDuration.add(res.timings.duration);

    const ok = check(res, {
      'InfoUser status is 200': (r) => r.status === 200,
      'User info exists': (r) => !!r.json().result?.email,
    });

    if (!ok) {
      infoUserFailures.add(1);
      console.error("❌ Falla al obtener info del usuario:", res.body);
      return;
    }

    userInfo = res.json().result;
    console.log("✅ Información del usuario obtenida:", userInfo.email);
  });

  // === OBTENER USER ACCESS TOKEN (3) ===
  group('3. Get User Access Token - /getUserAccessToken', () => {
    console.log("🔑 Solicitando User Access Token...");

    const payload = JSON.stringify({
      token: sessionToken,
      customerId: customerId,
    });

    const res = http.post('https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',  payload, {
      headers: {
        ...headersBase,
        'Cookie': `JSESSIONID=${jsessionid}`,
      },
    });

    accessTokenDuration.add(res.timings.duration);

    const ok = check(res, {
      'Access token status is 200': (r) => r.status === 200,
      'User access token received': (r) => !!r.json().result?.user_access_token,
    });

    if (!ok) {
      accessTokenFailures.add(1);
      console.error("❌ Falla al obtener el token de acceso:", res.body);
      return;
    }

    userAccessToken = res.json().result.user_access_token;
    console.log("✅ User Access Token recibido:", userAccessToken);
  });

  // === AUTH EN LIVE (4) ===
  group('4. Live Auth - /app-services-live/auth', () => {
    console.log("🔒 Autenticación en LIVE...");

    const payload = JSON.stringify({
      token: userAccessToken
    });

    const extraHeaders = {
      'accept': 'application/json, text/plain, */*',
      'accept-language': 'es-419,es;q=0.9,en;q=0.8',
      'content-type': 'application/json',
      'credentials': 'include',
      'origin': 'https://livetest.harvestful.org', 
      'priority': 'u=1, i',
      'referer': 'https://livetest.harvestful.org/', 
      'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"Windows"',
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
      'Cookie': `JSESSIONID=${jsessionid}; JSESSIONID=51AE8E7957FE5056D0D43DD2ED50C32D` // Puedes ajustar esto si es dinámico
    };

    const res = http.post('https://appservicestest.harvestful.org/app-services-live/auth',  payload, {
      headers: {
        ...headersBase,
        ...extraHeaders,
      },
    });

    liveAuthDuration.add(res.timings.duration);

    const ok = check(res, {
      'Live Auth status is 200': (r) => r.status === 200,
      'Live Auth success': (r) => r.json().returnCode === 0,
    });

    if (!ok) {
      liveAuthFailures.add(1);
      console.error("❌ Falla en autenticación LIVE:", res.body);
      return;
    }

    console.log("✅ Autenticado en LIVE.");
  });

  // === INICIAR SESIÓN EN LIVE (5) ===
  group('5. New Session - /app-services-live/newSession', () => {
    console.log("🎯 Iniciando sesión LIVE...");

    const payload = JSON.stringify({
      token: userAccessToken,
      customerId: customerId,
      userId: userId,
    });

    const res = http.post('https://appservicestest.harvestful.org/app-services-live/newSession',  payload, {
      headers: {
        ...headersBase,
        'Origin': 'https://livetest.harvestful.org', 
        'Referer': 'https://livetest.harvestful.org/', 
        'Cookie': `JSESSIONID=${jsessionid}`,
      },
    });

    newSessionDuration.add(res.timings.duration);

    const ok = check(res, {
      'New session status is 200': (r) => r.status === 200,
      'PrivateIP exists': (r) => !!r.json().result?.privateIP,
    });

    if (!ok) {
      newSessionFailures.add(1);
      console.error("❌ Falla en sesión LIVE:", res.body);
    } else {
      console.log("✅ Sesión LIVE iniciada. IP:", res.json().result?.privateIP);
    }
  });

  sleep(1);
}