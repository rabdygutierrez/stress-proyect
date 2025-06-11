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

  let jsessionid, sessionToken, userInfo, userAccessToken, customerId = 671, userId, userEmail;

  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org', 
    'Referer': 'https://portaltest.harvestful.org/', 
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
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
      console.error("❌ Respuesta no exitosa en autenticación");
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      authFailures.add(1);
      console.error("❌ No se pudo parsear JSON en autenticación");
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

    console.log("✅ Autenticación OK. sessionToken:", sessionToken);
    console.log("🍪 JSESSIONID obtenida:", jsessionid);
  });

  // === OBTENER INFO DEL USUARIO (2) ===
  group('2. Info User - /infoUser', () => {
    console.log("🧾 Obteniendo información del usuario...");

    if (!jsessionid || !sessionToken) {
      infoUserFailures.add(1);
      console.error("❌ Faltan datos previos para /infoUser", {
        jsessionid: jsessionid ? '[SET]' : '[MISSING]',
        sessionToken: sessionToken ? '[SET]' : '[MISSING]'
      });
      return;
    }

    const payload = JSON.stringify({ token: sessionToken }); // ✅ Usa sessionToken

    const res = http.post('https://appservicestest.harvestful.org/app-services-home/infoUser',  payload, {
      headers: {
        ...headersBase,
        'accept': 'application/json',
        'content-type': 'application/json',
        'cookie': `JSESSIONID=${jsessionid}`,
        'origin': 'https://portaltest.harvestful.org', 
        'referer': 'https://portaltest.harvestful.org/' 
      },
    });

    infoUserDuration.add(res.timings.duration);

    console.log(`🔹 Status InfoUser: ${res.status}`);
    if (res.status !== 200) {
      infoUserFailures.add(1);
      console.error("❌ Error HTTP en /infoUser:", res.status);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      infoUserFailures.add(1);
      console.error("❌ Respuesta no es JSON en /infoUser");
      return;
    }

    const ok = check(json, {
      'User info has userId and email': (j) => !!j.result?.user?.id && !!j.result?.user?.email,
    });

    if (!ok) {
      infoUserFailures.add(1);
      console.error("❌ Datos incompletos en /infoUser", json);
      return;
    }

    userInfo = json.result;
    userId = json.result.user.id;
    userEmail = json.result.user.email;

    console.log("✅ Información del usuario obtenida:");
    console.log(`   userId: ${userId}`);
    console.log(`   email: ${userEmail}`);
    console.log(`   customerId: ${customerId}`);
  });

  // === OBTENER USER ACCESS TOKEN (3) ===
  group('3. Get User Access Token - /getUserAccessToken', () => {
    console.log("🔑 Solicitando User Access Token...");

    if (!sessionToken || !userEmail || !customerId) {
      accessTokenFailures.add(1);
      console.error("❌ Datos faltantes para /getUserAccessToken", {
        sessionToken: sessionToken ? '[SET]' : '[MISSING]',
        userEmail: userEmail ? `[${userEmail}]` : '[MISSING]',
        customerId: `[${customerId}]`
      });
      return;
    }

    const payload = JSON.stringify({
      token: sessionToken,     // ✅ Viene de /authenticate
      customerId: customerId, // ✅ Fijo como 671
      email: userEmail        // ✅ Importante: requerido por el backend
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken', 
      payload, {
        headers: {
          ...headersBase,
          'accept': 'application/json',
          'content-type': 'application/json',
          'cookie': `JSESSIONID=${jsessionid}`,
          'origin': 'https://portaltest.harvestful.org', 
          'referer': 'https://portaltest.harvestful.org/' 
        },
      }
    );

    accessTokenDuration.add(res.timings.duration);

    console.log(`🔹 Status getUserAccessToken: ${res.status}`);
    if (res.status !== 200) {
      accessTokenFailures.add(1);
      console.error("❌ Error HTTP en /getUserAccessToken:", res.status);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      accessTokenFailures.add(1);
      console.error("❌ Respuesta no es JSON en /getUserAccessToken");
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

    if (!userAccessToken) {
      liveAuthFailures.add(1);
      console.error("❌ Falta userAccessToken");
      return;
    }

    const payload = JSON.stringify({
      token: userAccessToken // ✅ Usamos el nuevo token para LIVE
    });

    const extraHeaders = {
      ...headersBase,
      'accept': 'application/json',
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
      'Cookie': `JSESSIONID=${jsessionid}`
    };

    const res = http.post('https://appservicestest.harvestful.org/app-services-live/auth',  payload, {
      headers: extraHeaders,
    });

    liveAuthDuration.add(res.timings.duration);

    console.log(`🔹 Status Live Auth: ${res.status}`);
    if (res.status !== 200) {
      liveAuthFailures.add(1);
      console.error("❌ Error HTTP en /auth (LIVE):", res.status);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      liveAuthFailures.add(1);
      console.error("❌ Respuesta no es JSON en /auth (LIVE)");
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

    if (!userAccessToken || !userId) {
      newSessionFailures.add(1);
      console.error("❌ Datos incompletos para /newSession");
      console.error("Valores actuales:", {
        userAccessToken: userAccessToken ? '[SET]' : '[MISSING]',
        customerId: `[${customerId}]`,
        userId: userId ? `[${userId}]` : '[MISSING]',
      });
      return;
    }

    const payload = JSON.stringify({
      token: userAccessToken,
      customerId: customerId,
      userId: userId
    });

    const res = http.post('https://appservicestest.harvestful.org/app-services-live/newSession',  payload, {
      headers: {
        ...headersBase,
        'accept': 'application/json',
        'content-type': 'application/json',
        'cookie': `JSESSIONID=${jsessionid}`,
        'origin': 'https://livetest.harvestful.org', 
        'referer': 'https://livetest.harvestful.org/' 
      },
    });

    newSessionDuration.add(res.timings.duration);

    console.log(`🔹 Status NewSession: ${res.status}`);
    if (res.status !== 200) {
      newSessionFailures.add(1);
      console.error("❌ Error HTTP en /newSession:", res.status);
      return;
    }

    let json;
    try {
      json = res.json();
    } catch (e) {
      newSessionFailures.add(1);
      console.error("❌ Respuesta no es JSON en /newSession");
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