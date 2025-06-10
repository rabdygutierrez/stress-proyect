import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

// MÉTRICAS
const authDuration = new Trend('authentication_duration');
const infoUserDuration = new Trend('info_user_duration');
const purchaseDuration = new Trend('purchase_duration');
const liveAuthDuration = new Trend('live_auth_duration');
const newSessionDuration = new Trend('new_session_duration');

// CARGA DE USUARIOS
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10000.json')).usuarios
);

// CONFIGURACIÓN
export const options = {
  vus: 10,
  duration: '2m',
};

export default function () {
  console.log("🔁 Iniciando iteración...");

  const user = users[Math.floor(Math.random() * users.length)];
  if (!user) {
    console.warn("❌ Usuario no válido");
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
  let token;
  let customerId;
  let userId;
  let userAccessToken;

  // GRUPO: Autenticación
  group('Authenticate User', () => {
    console.log("🚀 Iniciando autenticación...");
    const payload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate', 
      payload,
      {
        headers: headersBase,
        tags: {
          name: 'authenticate',
          group: 'Authenticate User',
          method: 'POST'
        }
      }
    );

    authDuration.add(res.timings.duration, {
      name: 'authenticate',
      group: 'Authenticate User',
      status: res.status,
      method: 'POST'
    });

    const ok = check(res, {
      'auth status 200': (r) => r.status === 200,
      'auth has Set-Cookie': (r) => !!r.cookies['JSESSIONID'],
      'auth has token': (r) => {
        try {
          return r.json().result?.token !== undefined;
        } catch (e) {
          return false;
        }
      },
    });

    if (!ok) {
      console.error("❌ Autenticación fallida:", res.body);
      return;
    }

    jsessionid = res.cookies['JSESSIONID'][0].value;
    token = res.json().result.token;
    customerId = res.json().result.customerId;
    userId = res.json().result.userId;

    jar.set('https://appservicestest.harvestful.org',  'JSESSIONID', jsessionid);
    console.log("✅ Autenticación exitosa.");
  });

  if (!jsessionid || !token) return;

  // GRUPO: Info User
  group('Info User Request', () => {
    console.log("🔍 Iniciando Info User...");
    const payload = JSON.stringify({ token });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser', 
      payload,
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
        tags: {
          name: 'info_user',
          group: 'Info User Request',
          method: 'POST'
        }
      }
    );

    infoUserDuration.add(res.timings.duration, {
      name: 'info_user',
      group: 'Info User Request',
      status: res.status,
      method: 'POST'
    });

    check(res, {
      'infoUser status 200': (r) => r.status === 200,
      'infoUser has data': (r) => {
        try {
          return r.body && r.body.length > 10;
        } catch (e) {
          return false;
        }
      },
    });
  });

  // GRUPO: Compra
  group('Assisted CC Purchase', () => {
    console.log("💳 Iniciando compra...");
    const payload = JSON.stringify({
      token,
      card: "",
      name: user.name || `Test_${__VU}_${__ITER}`,
      lastname: user.lastname || `Test_${__VU}_${__ITER}`,
      phone: user.phone || `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
      email: user.email,
      country: user.country || 'US',
      langid: 1,
      savePaymentData: false,
      customer_id: customerId
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/search/api/assistedCCPurchase', 
      payload,
      {
        headers: {
          ...headersBase,
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
        tags: {
          name: 'assisted_cc_purchase',
          group: 'Assisted CC Purchase',
          method: 'POST'
        }
      }
    );

    purchaseDuration.add(res.timings.duration, {
      name: 'assisted_cc_purchase',
      group: 'Assisted CC Purchase',
      status: res.status,
      method: 'POST'
    });

    try {
      const json = res.json();
      if (json.result?.authorizationInfo?.userAccessToken) {
        userAccessToken = json.result.authorizationInfo.userAccessToken;
        console.log("✅ userAccessToken obtenido.");
      }
    } catch (e) {
      console.error("❌ Error parseando respuesta de compra.");
    }
  });

  if (!userAccessToken) return;

  // GRUPO: Live Auth
  group('Live Auth Before New Session', () => {
    console.log("📡 Iniciando Live Auth...");
    const payload = JSON.stringify({ token });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-live/auth', 
      payload,
      {
        headers: {
          ...headersBase,
          'Referer': 'https://livetest.harvestful.org/', 
          'Origin': 'https://livetest.harvestful.org', 
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
        tags: {
          name: 'live_auth',
          group: 'Live Auth Before New Session',
          method: 'POST'
        }
      }
    );

    liveAuthDuration.add(res.timings.duration, {
      name: 'live_auth',
      group: 'Live Auth Before New Session',
      status: res.status,
      method: 'POST'
    });

    check(res, {
      'live auth status 200': (r) => r.status === 200
    });
  });

  // GRUPO: Nueva Sesión
  group('New Session', () => {
    console.log("🔄 Iniciando New Session...");
    const payload = JSON.stringify({
      token: userAccessToken,
      customerId,
      userId
    });

    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-live/newSession', 
      payload,
      {
        headers: {
          ...headersBase,
          'Referer': 'https://livetest.harvestful.org/', 
          'Origin': 'https://livetest.harvestful.org', 
          'Cookie': `JSESSIONID=${jsessionid}`,
        },
        tags: {
          name: 'new_session',
          group: 'New Session',
          method: 'POST'
        }
      }
    );

    newSessionDuration.add(res.timings.duration, {
      name: 'new_session',
      group: 'New Session',
      status: res.status,
      method: 'POST'
    });

    check(res, {
      'newSession status 200': (r) => r.status === 200
    });
  });

  sleep(1);
}