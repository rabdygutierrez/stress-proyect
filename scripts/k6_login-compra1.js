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

  let jsessionid, sessionToken, userInfo, userAccessToken, customerId = 671, userId;
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

    console.log(`🔹 Status Auth: ${res.status}`);
    if (res.status !== 200) {
      authFailures.add(1);
      console.error("❌ Respuesta no exitosa en autenticación:", res.body);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      authFailures.add(1);
      console.error("❌ No se pudo parsear JSON en autenticación:", res.body);
      return;
    }

    const ok = check(json, {
      'Auth token received': (j) => !!j.result?.token,
    });

    if (!ok) {
      authFailures.add(1);
      console.error("❌ Datos esperados no encontrados en autenticación:", json);
      return;
    }

    sessionToken = json.result.token;
    jsessionid = res.cookies['JSESSIONID']?.[0]?.value || '';

    console.log("✅ Autenticación OK. Token:", sessionToken);
    console.log("🍪 JSESSIONID obtenida:", jsessionid);
  });

  // === OBTENER INFO DEL USUARIO (2) ===
  group('2. Info User - /infoUser', () => {
    console.log("🧾 Obteniendo información del usuario...");

    if (!jsessionid) {
      infoUserFailures.add(1);
      console.error("❌ No hay JSESSIONID disponible");
      return;
    }

    const res = http.get('https://appservicestest.harvestful.org/app-services-home/infoUser',  {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'es-419,es;q=0.9,en;q=0.8',
        'content-type': 'application/json',
        'credentials': 'include',
        'origin': 'https://portaltest.harvestful.org', 
        'priority': 'u=1, i',
        'referer': 'https://portaltest.harvestful.org/', 
        'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        'Cookie': `JSESSIONID=${jsessionid}; JSESSIONID=27A9483287BB794F051AD165D10A36EE`,
      },
    });

    infoUserDuration.add(res.timings.duration);

    console.log(`🔹 Status InfoUser: ${res.status}`);
    if (res.status !== 200) {
      infoUserFailures.add(1);
      console.error("❌ Error HTTP en /infoUser:", res.status);
      console.error("Respuesta:", res.body);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      infoUserFailures.add(1);
      console.error("❌ Respuesta no es JSON en /infoUser");
      console.error("Contenido recibido:", res.body.substring(0, 200));
      return;
    }

    const ok = check(json, {
      'User info has userId and token': (j) => !!j.result?.userId && !!j.result?.token,
    });

    if (!ok) {
      infoUserFailures.add(1);
      console.error("❌ Datos incompletos en /infoUser", json);
      return;
    }

    userInfo = json.result;
    userId = userInfo.userId;
    sessionToken = userInfo.token;

    console.log("✅ Información del usuario obtenida:");
    console.log(`   userId: ${userId}`);
    console.log(`   token: ${sessionToken}`);
    console.log(`   customerId: ${customerId}`);
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

    console.log(`🔹 Status getUserAccessToken: ${res.status}`);
    if (res.status !== 200) {
      accessTokenFailures.add(1);
      console.error("❌ Error HTTP en /getUserAccessToken:", res.status);
      console.error("Respuesta:", res.body);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      accessTokenFailures.add(1);
      console.error("❌ Respuesta no es JSON en /getUserAccessToken");
      console.error("Contenido recibido:", res.body.substring(0, 200));
      return;
    }

    const ok = check(json, {
      'User access token received': (j) => !!j.result?.user_access_token,
    });

    if (!ok) {
      accessTokenFailures.add(1);
      console.error("❌ Token no encontrado en /getUserAccessToken", json);
      return;
    }

    userAccessToken = json.result.user_access_token;
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
      'Cookie': `JSESSIONID=${jsessionid}; JSESSIONID=51AE8E7957FE5056D0D43DD2ED50C32D`
    };

    const res = http.post('https://appservicestest.harvestful.org/app-services-live/auth',  payload, {
      headers: extraHeaders,
    });

    liveAuthDuration.add(res.timings.duration);

    console.log(`🔹 Status Live Auth: ${res.status}`);
    if (res.status !== 200) {
      liveAuthFailures.add(1);
      console.error("❌ Error HTTP en /auth (LIVE):", res.status);
      console.error("Respuesta:", res.body);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      liveAuthFailures.add(1);
      console.error("❌ Respuesta no es JSON en /auth (LIVE)");
      console.error("Contenido recibido:", res.body.substring(0, 200));
      return;
    }

    const ok = check(json, {
      'Live Auth success': (j) => j.returnCode === 0,
    });

    if (!ok) {
      liveAuthFailures.add(1);
      console.error("❌ Autenticación en LIVE falló:", json);
      return;
    }

    console.log("✅ Autenticado en LIVE.");
  });

  // === INICIAR SESIÓN EN LIVE (5) ===
  group('5. New Session - /app-services-live/newSession', () => {
    console.log("🎯 Iniciando sesión LIVE...");

    if (!userAccessToken || !customerId || !userId) {
      newSessionFailures.add(1);
      console.error("❌ Datos incompletos para /newSession");
      console.error("Valores actuales:", {
        userAccessToken: userAccessToken ? '[SET]' : '[MISSING]',
        customerId: customerId ? `[${customerId}]` : '[MISSING]',
        userId: userId ? `[${userId}]` : '[MISSING]',
      });
      return;
    }

    sleep(1); // Pequeña pausa para evitar problemas de sincronización

    const payload = JSON.stringify({
      token: userAccessToken,
      customerId: customerId,
      userId: userId,
    });

    const res = http.post('https://appservicestest.harvestful.org/app-services-live/newSession',  payload, {
      headers: {
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
        'Cookie': `JSESSIONID=${jsessionid}; JSESSIONID=2411F141CFDF9BA1202D203138A5BBBC`,
      },
    });

    newSessionDuration.add(res.timings.duration);

    console.log(`🔹 Status NewSession: ${res.status}`);
    if (res.status !== 200) {
      newSessionFailures.add(1);
      console.error("❌ Error HTTP en /newSession:", res.status);
      console.error("Respuesta:", res.body);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      newSessionFailures.add(1);
      console.error("❌ Respuesta no es JSON en /newSession");
      console.error("Contenido recibido:", res.body.substring(0, 200));
      return;
    }

    const ok = check(json, {
      'PrivateIP exists': (j) => !!j.result?.privateIP,
    });

    if (!ok) {
      newSessionFailures.add(1);
      console.error("❌ IP privada no encontrada en /newSession", json);
      return;
    }

    console.log("✅ Sesión LIVE iniciada. IP:", json.result.privateIP);
  });

  sleep(1);
}