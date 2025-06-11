import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';

// === MÉTRICAS ===
const infoUserDuration = new Trend('infoUser_duration');
const newSessionDuration = new Trend('newSession_duration');
const loginFailRate = new Rate('login_fail_rate');

// === CARGA DE USUARIOS (sólo 5) ===
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10.json')).usuarios.slice(0, 5)
);

// === CONFIGURACIÓN ===
export const options = {
  stages: [
    { duration: '30s', target: 3 },
    { duration: '30s', target: 5 },
  ],
};

export default function () {
  const user = users[__VU % users.length];
  const email = user.email;
  const customerId = user.customer_id;

  group('Login y acceso', function () {
    console.info(`🔐 Enviando authenticate para ${email}`);

    const authPayload = JSON.stringify({ email, password: 'AdminQA*' });
    const authHeaders = { headers: { 'Content-Type': 'application/json' } };

    const authRes = http.post(
      'https://apptest.harvestful.org/app-services-home/authenticate',
      authPayload,
      authHeaders
    );

    console.info(`📥 Response authenticate: ${authRes.body}`);

    const authOk = check(authRes, {
      'Código 200 en authenticate': (res) => res.status === 200,
      'Login exitoso': (res) => res.json('returnCode') === 0,
    });

    if (!authOk) {
      console.error('❌ Error en authenticate');
      loginFailRate.add(1);
      return;
    }

    loginFailRate.add(0);

    // === Paso 2: getUserAccessToken ===
    const tokenRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/getUserAccessToken',
      JSON.stringify({ email, customer_id: customerId }),
      authHeaders
    );

    const tokenData = tokenRes.json();
    const token = tokenData?.result?.user_access_token;

    if (!token) {
      console.error('❌ No se recibió user_access_token');
      return;
    }

    console.info(`🔑 Token recibido: ${token.substring(0, 30)}...`);

    // === Paso 3: infoUser ===
    console.info('📡 Llamando infoUser con token');

    const infoHeaders = {
      headers: {
        'Content-Type': 'application/json',
        token: token,
      },
    };

    const infoRes = http.post(
      'https://apptest.harvestful.org/app-services-home/infoUser',
      JSON.stringify({}),
      infoHeaders
    );

    infoUserDuration.add(infoRes.timings.duration);

    console.info(`📥 Response infoUser: ${infoRes.body}`);

    const infoOk = check(infoRes, {
      'Código 200 en infoUser': (res) => res.status === 200,
      'infoUser válido': (res) => res.json('returnCode') === 0,
    });

    if (!infoOk) {
      console.error('❌ Error en infoUser');
      return;
    }

    // === Paso 4: newSession ===
    const sessionRes = http.post(
      'https://apptest.harvestful.org/app-services-home/newSession',
      JSON.stringify({}),
      infoHeaders
    );

    newSessionDuration.add(sessionRes.timings.duration);

    console.info(`📥 Response newSession: ${sessionRes.body}`);

    const sessionOk = check(sessionRes, {
      'Código 200 en newSession': (res) => res.status === 200,
      'newSession válido': (res) => res.json('returnCode') === 0,
    });

    if (!sessionOk) {
      console.error('❌ Error en newSession');
    }

    sleep(1);
  });
}
