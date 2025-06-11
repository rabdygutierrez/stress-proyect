import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

// === MÉTRICAS PERSONALIZADAS ===
const authDuration = new Trend('authentication_duration');
const purchaseDuration = new Trend('purchase_duration');
const newSessionDuration = new Trend('new_session_duration');

const authFailures = new Rate('authentication_failures');
const purchaseFailures = new Rate('purchase_failures');
const newSessionFailures = new Rate('newSession_failures');

// === CARGA DE USUARIOS ===
const users = new SharedArray('usuarios', () => {
  return JSON.parse(open('./user_10.json')).usuarios.slice(0, 5); // Solo 5 usuarios
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

  let jsessionid, token, userAccessToken, customerId, userId;
  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org',
    'Referer': 'https://portaltest.harvestful.org/',
    'User-Agent': 'Mozilla/5.0',
  };

  // === AUTENTICACIÓN ===
  group('Authenticate', () => {
    console.log(`🔐 Autenticando: ${user.email}`);
    const payload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const res = http.post('https://appservicestest.harvestful.org/app-services-home/authenticate', payload, {
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

    token = res.json().result.token;
    customerId = res.json().result.customerId;
    userId = res.json().result.userId;
    jsessionid = res.cookies['JSESSIONID']?.[0]?.value || '';

    console.log("✅ Autenticación OK. Token:", token);
  });

  // === SOLICITAR TOKEN DE ACCESO (purchase) ===
  group('Assisted CC Purchase', () => {
    console.log("💳 Solicitando token de acceso...");
    const payload = JSON.stringify({
      token,
      card: "",
      name: user.name || `Test_${__VU}_${__ITER}`,
      lastname: user.lastname || `Test_${__VU}_${__ITER}`,
      phone: user.phone || `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: user.email,
      country: user.country || "US",
      langid: 1,
      savePaymentData: false,
      customer_id: customerId,
    });

    const res = http.post('https://appservicestest.harvestful.org/app-services-home/search/api/assistedCCPurchase', payload, {
      headers: {
        ...headersBase,
        'Cookie': `JSESSIONID=${jsessionid}`,
      },
    });

    purchaseDuration.add(res.timings.duration);

    const ok = check(res, {
      'Purchase status is 200': (r) => r.status === 200,
      'Access token received': (r) => !!r.json().result?.authorizationInfo?.userAccessToken,
    });

    if (!ok) {
      purchaseFailures.add(1);
      console.error("❌ Falla al solicitar access token:", res.body);
      return;
    }

    userAccessToken = res.json().result.authorizationInfo.userAccessToken;
    console.log("✅ Access token OK:", userAccessToken);
  });

  // === INICIAR SESIÓN EN LIVE ===
  group('New Session', () => {
    console.log("🎯 Iniciando sesión LIVE...");

    const payload = JSON.stringify({
      token: userAccessToken,
      customerId: customerId,
      userId: userId,
    });

    const res = http.post('https://appservicestest.harvestful.org/app-services-live/newSession', payload, {
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
