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
const liveAuthFailures = new Rate('live_auth_failures'); // Nueva métrica
const liveAuthDuration = new Trend('live_auth_duration'); // Nueva métrica
const newSessionFailures = new Rate('newSession_failures');
const newSessionDuration = new Trend('newSession_duration');
const userCount = new Counter('users_tested');

// CARGA DE USUARIOS
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10000.json')).usuarios
);

// CONFIGURACIÓN DEL ESCENARIO
//simula 1,000 usuarios concurrentes realizando un flujo de negocio completo 
// (login, ver perfil, realizar una compra, autenticar y crear una sesión en vivo) 
// Se ejecutará por un máximo de 10 minutos y cada usuario intentará el flujo 100 veces.
export const options = {
  scenarios: {
    user_auth_info_purchase_live_flow: { // Nombre del escenario
      executor: 'per-vu-iterations',
      vus: 1000,
      iterations: 100,
      maxDuration: '10m',
    },
  },
  // SE HA ELIMINADO EL BLOQUE 'thresholds' para que la prueba no se detenga por fallos de rendimiento.
  // Los errores y los datos de rendimiento se seguirán registrando y estarán visibles en Grafana.
};

// FLUJO PRINCIPAL
export default function () {
  const user = users[Math.floor(Math.random() * users.length)];

  if (!user) {
    console.warn(`No se encontró un usuario. Esto no debería ocurrir si el archivo JSON es válido.`);
    return;
  }

  let jar = http.cookieJar();
  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org',
    'Referer': 'https://portaltest.harvestful.org/',
    'User-Agent': 'Mozilla/5.0',
  };

  let jsessionid;
  let token; // token de autenticación
  let customerId;
  let userId;
  let userAccessToken; // token obtenido de la compra

  group('Authenticate User', () => {
    const authPayload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate',
      authPayload,
      { headers: headersBase }
    );

    authDuration.add(res.timings.duration);

    const ok = check(res, {
      'auth status 200': (r) => r.status === 200,
      'auth has Set-Cookie': (r) => !!r.cookies['JSESSIONID'],
      'auth has token': (r) => r.json().result?.token !== undefined,
    });

    if (!ok) {
      authFailures.add(1);
      console.error('Autenticación fallida. Respuesta:', res.body);
      return;
    }

    jsessionid = res.cookies['JSESSIONID'][0].value;
    token = res.json().result.token;
    customerId = res.json().result.customerId;
    userId = res.json().result.userId;

    jar.set('https://appservicestest.harvestful.org', 'JSESSIONID', jsessionid);
    userCount.add(1);
  });

  // Si la autenticación falla, sal del flujo principal
  if (!jsessionid || !token) {
    return;
  }

  group('Info User Request', () => {
    const infoRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser',
      JSON.stringify({ token }),
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    infoUserDuration.add(infoRes.timings.duration);

    const okInfo = check(infoRes, {
      'infoUser 200': (r) => r.status === 200,
      'infoUser has data': (r) => !!r.body && r.body.length > 10,
    });

    if (!okInfo) {
      infoUserFailures.add(1);
      console.error('InfoUser fallida. Respuesta:', infoRes.body);
    }
  });

  group('Assisted CC Purchase', () => {
    const purchasePayload = JSON.stringify({
      token: token,
      card: "",
      name: user.name || `TestFirstName_${__VU}_${__ITER}`,
      lastname: user.lastname || `TestLastName_${__VU}_${__ITER}`,
      phone: user.phone || `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: user.email,
      country: user.country || "US",
      langid: 1,
      savePaymentData: false,
      customer_id: customerId,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
    });

    const purchaseRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/search/api/assistedCCPurchase',
      purchasePayload,
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
      }
    );

    purchaseDuration.add(purchaseRes.timings.duration);

    const okPurchase = check(purchaseRes, {
      'purchase status 200': (r) => r.status === 200,
      'purchase successful': (r) => r.json().returnCode === 0 && r.json().returnMessageCode === "OK200",
      'purchase has userAccessToken': (r) => r.json().result?.authorizationInfo?.userAccessToken !== undefined,
    });

    if (!okPurchase) {
      purchaseFailures.add(1);
      console.error('Compra fallida. Respuesta:', purchaseRes.body);
    } else {
      userAccessToken = purchaseRes.json().result.authorizationInfo.userAccessToken;
      console.log('Compra exitosa. userAccessToken:', userAccessToken);
    }
  });

  // Si la compra falla o no se obtiene el userAccessToken, sal del flujo
  if (!userAccessToken) {
    return;
  }

  group('Live Auth (before new session)', () => {
    const liveAuthPayload = JSON.stringify({
      token: token, // Ahora usa el token ORIGINAL de la autenticación
    });

    const liveAuthRes = http.post(
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

    liveAuthDuration.add(liveAuthRes.timings.duration);

    const okLiveAuth = check(liveAuthRes, {
      'live auth status 200': (r) => r.status === 200,
      'live auth successful': (r) => r.json().returnCode === 0 && r.json().returnMessageCode === "OK200",
      'live auth has customerId': (r) => r.json().result?.customerId !== undefined,
      'live auth has user data': (r) => r.json().result?.user?.email !== undefined,
    });

    if (!okLiveAuth) {
      liveAuthFailures.add(1);
      console.error('Live Auth fallida. Respuesta:', liveAuthRes.body);
    } else {
      console.log('Live Auth exitosa. Customer ID:', liveAuthRes.json().result?.customerId);
    }
  });

  group('New Session', () => {
    const newSessionPayload = JSON.stringify({
      token: userAccessToken, // New Session usa el userAccessToken de la compra
      customerId: customerId,
      userId: userId,
    });

    const newSessionRes = http.post(
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

    newSessionDuration.add(newSessionRes.timings.duration);

    const okNewSession = check(newSessionRes, {
      'newSession status 200': (r) => r.status === 200,
      'newSession successful': (r) => r.json().returnCode === 0 && r.json().returnMessageCode === "OK200",
      'newSession has privateIP': (r) => r.json().result?.privateIP !== undefined,
    });

    if (!okNewSession) {
      newSessionFailures.add(1);
      console.error('New Session fallida. Respuesta:', newSessionRes.body);
    } else {
      console.log('New Session exitosa. privateIP:', newSessionRes.json().result?.privateIP);
    }
  });

  sleep(1);
}