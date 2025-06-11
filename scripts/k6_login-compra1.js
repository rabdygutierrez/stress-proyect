import http from 'k6/http';
import { check, group, fail, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// === MÉTRICAS PERSONALIZADAS ===
let loginFailRate = new Rate('login_fail_rate');
let loginDuration = new Trend('login_duration');
let loginSuccessCount = new Counter('login_success_count');
const infoUserDuration = new Trend('infoUser_duration');
const newSessionDuration = new Trend('newSession_duration');

// === CARGA DE USUARIOS (sólo 5) ===
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10.json')).usuarios.slice(0, 5)
);

// === CONFIGURACIÓN DE PRUEBA ===
export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

export default function () {
  // Asignar usuario dinámicamente según VU (Virtual User)
  const user = users[__VU - 1]; // __VU empieza en 1, slice de 5 usuarios

  const email = user.email;
  const password = user.password;
  const channel = 'WEB';
  const device = 'ChromeTest';

  let token = '';
  let customerId = '';
  let userAccessToken = '';
  let privateIP = '';

  group('1. Authenticate', function () {
    const authPayload = { email, password, channel, device };

    console.log(`🔐 Enviando authenticate para ${email}`);

    const authRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate',
      JSON.stringify(authPayload),
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log(`📥 Response authenticate: ${authRes.body}`);

    if (!check(authRes, {
      'status 200': (r) => r.status === 200,
      'login exitoso': (r) => r.json().returnCode === 0,
    })) {
      loginFailRate.add(1);
      fail('❌ authenticate failed');
    }

    const result = authRes.json().result;
    token = result.token;
    customerId = result.customerId;
    privateIP = result.privateIP;

    console.log(`✅ Token: ${token}`);
    console.log(`🆔 Customer ID: ${customerId}`);
    console.log(`🌐 Private IP: ${privateIP}`);

    loginSuccessCount.add(1);
    loginDuration.add(authRes.timings.duration);
  });

  sleep(1);

  group('2. InfoUser', function () {
    const start = Date.now();

    console.log(`📡 Llamando infoUser con token`);

    const infoRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser',
      '{}',
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Private-IP': privateIP,
        },
      }
    );

    const duration = Date.now() - start;
    infoUserDuration.add(duration);

    console.log(`📥 Response infoUser: ${infoRes.body}`);

    if (!check(infoRes, {
      'status 200': (r) => r.status === 200,
      'infoUser exitoso': (r) => r.json().returnCode === 0,
    })) {
      fail('⚠️ infoUser failed');
    }
  });

  sleep(1);

  group('3. GetUserAccessToken', function () {
    const tokenPayload = { email, customer_id: customerId };

    console.log(`🎫 Solicitando user access token`);

    const accessTokenRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
      JSON.stringify(tokenPayload),
      { headers: { 'Content-Type': 'application/json' } }
    );

    console.log(`📥 Response getUserAccessToken: ${accessTokenRes.body}`);

    if (!check(accessTokenRes, {
      'status 200': (r) => r.status === 200,
      'token recibido': (r) => r.json().returnCode === 0,
    })) {
      fail('⚠️ getUserAccessToken failed');
    }

    userAccessToken = accessTokenRes.json().result.user_access_token;
    console.log(`✅ User Access Token: ${userAccessToken}`);
  });

  sleep(1);

  group('4. NewSession', function () {
    const sessionPayload = {
      customer_id: customerId,
      event_access_token: userAccessToken,
      private_ip: privateIP,
      user_device: device,
    };

    const start = Date.now();

    console.log(`🛎️ Iniciando newSession`);

    const newSessionRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/newSession',
      JSON.stringify(sessionPayload),
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`, // Por si la API lo requiere
        },
      }
    );

    const duration = Date.now() - start;
    newSessionDuration.add(duration);

    console.log(`📥 Response newSession: ${newSessionRes.body}`);

    if (!check(newSessionRes, {
      'status 200': (r) => r.status === 200,
      'newSession exitosa': (r) => r.json().returnCode === 0,
    })) {
      fail('❌ newSession failed');
    } else {
      console.log('🎉 Sesión creada con éxito');
    }
  });

  sleep(1);
}
