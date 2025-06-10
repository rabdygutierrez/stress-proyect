import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend, Rate } from 'k6/metrics';

// MÉTRICAS PERSONALIZADAS
const authFailures = new Rate('authentication_failures');
const authDuration = new Trend('authentication_duration');
const infoUserFailures = new Rate('infoUser_failures');
const infoUserDuration = new Trend('infoUser_duration');
const purchaseFailures = new Rate('purchase_failures');
const purchaseDuration = new Trend('purchase_duration');
const liveAuthFailures = new Rate('live_auth_failures');
const liveAuthDuration = new Trend('live_auth_duration');
const newSessionFailures = new Rate('newSession_failures');
const newSessionDuration = new Trend('newSession_duration');
const userCount = new Counter('users_tested');

// USUARIOS DESDE ARCHIVO
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10000.json')).usuarios
);

// ESCENARIO DE PRUEBA AJUSTADO
export const options = {
  scenarios: {
    user_live_event_presence: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 },
        { duration: '30s', target: 20 },
      ],
    },
  },
};

// LOGGING DETALLADO PARA DEBUG
function logResponse(label, res) {
  console.log(`\n--- ${label} ---`);
  console.log(`Status: ${res.status}`);
  console.log(`Body: ${res.body.substring(0, 300)}...`); // evita logs largos
}

// FLUJO COMPLETO DE USUARIO
export default function () {
  const user = users[Math.floor(Math.random() * users.length)];
  if (!user) {
    console.warn('Usuario no encontrado');
    return;
  }

  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org',
    'Referer': 'https://portaltest.harvestful.org/',
    'User-Agent': 'Mozilla/5.0',
  };

  let jsessionid;
  let token;
  let customerId;
  let userId;
  let userAccessToken;

  group(':: Authenticate User', () => {
    const authPayload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const resAuth = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate',
      authPayload,
      { headers: headersBase }
    );

    logResponse('Authenticate', resAuth);
    authDuration.add(resAuth.timings.duration);

    const ok = check(resAuth, {
      'auth status 200': (r) => r.status === 200,
      'auth has token': (r) => r.json().result?.token !== undefined,
    });

    if (!ok) {
      authFailures.add(1);
      return;
    }

    jsessionid = resAuth.cookies['JSESSIONID']?.[0]?.value;
    token = resAuth.json().result.token;
    customerId = resAuth.json().result.customerId;
    userId = resAuth.json().result.userId;

    userCount.add(1);
  });

  if (!token || !jsessionid) return;

  group(':: InfoUser', () => {
    const resInfo = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser',
      JSON.stringify({ token }),
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    logResponse('InfoUser', resInfo);
    infoUserDuration.add(resInfo.timings.duration);

    const ok = check(resInfo, {
      'infoUser status 200': (r) => r.status === 200,
    });

    if (!ok) {
      infoUserFailures.add(1);
    }
  });

  group(':: Purchase', () => {
    const purchasePayload = JSON.stringify({
      token,
      card: "",
      name: user.name || `First_${__VU}_${__ITER}`,
      lastname: user.lastname || `Last_${__VU}_${__ITER}`,
      phone: user.phone || `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: user.email,
      country: user.country || "US",
      langid: 1,
      savePaymentData: false,
      customer_id: customerId,
    });

    const resPurchase = http.post(
      'https://appservicestest.harvestful.org/app-services-home/search/api/assistedCCPurchase',
      purchasePayload,
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    logResponse('Purchase', resPurchase);
    purchaseDuration.add(resPurchase.timings.duration);

    const ok = check(resPurchase, {
      'purchase status 200': (r) => r.status === 200,
      'purchase success': (r) =>
        r.json().returnCode === 0 &&
        r.json().returnMessageCode === 'OK200' &&
        r.json().result?.authorizationInfo?.userAccessToken !== undefined,
    });

    if (!ok) {
      purchaseFailures.add(1);
      return;
    }

    userAccessToken = resPurchase.json().result.authorizationInfo.userAccessToken;
  });

  if (!userAccessToken) return;

  group(':: Live Auth', () => {
    const liveAuthPayload = JSON.stringify({ token });

    const resLiveAuth = http.post(
      'https://appservicestest.harvestful.org/app-services-live/auth',
      liveAuthPayload,
      {
        headers: {
          ...headersBase,
          'Referer': 'https://livetest.harvestful.org/',
          'Origin': 'https://livetest.harvestful.org',
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    logResponse('Live Auth', resLiveAuth);
    liveAuthDuration.add(resLiveAuth.timings.duration);

    const ok = check(resLiveAuth, {
      'live auth status 200': (r) => r.status === 200,
    });

    if (!ok) {
      liveAuthFailures.add(1);
    }
  });

  group(':: New Session', () => {
    const newSessionPayload = JSON.stringify({
      token: userAccessToken,
      customerId,
      userId,
    });

    const resNewSession = http.post(
      'https://appservicestest.harvestful.org/app-services-live/newSession',
      newSessionPayload,
      {
        headers: {
          ...headersBase,
          'Referer': 'https://livetest.harvestful.org/',
          'Origin': 'https://livetest.harvestful.org',
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    logResponse('New Session', resNewSession);
    newSessionDuration.add(resNewSession.timings.duration);

    const ok = check(resNewSession, {
      'newSession status 200': (r) => r.status === 200,
    });

    if (!ok) {
      newSessionFailures.add(1);
    }
  });

  sleep(1);
}