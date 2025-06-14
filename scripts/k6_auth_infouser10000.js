import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend, Rate } from 'k6/metrics';

// === MÉTRICAS PERSONALIZADAS ===
const authFailures = new Rate('authentication_failures');
const authDuration = new Trend('authentication_duration');
const infoUserFailures = new Rate('infoUser_failures');
const infoUserDuration = new Trend('infoUser_duration');
const userCount = new Counter('users_tested');

// === CARGA DE DATOS ===
const users = new SharedArray('usuarios', () =>
JSON.parse(open('./users_10000.json')).usuarios 
);

// === CONFIGURACIÓN ===
// El script ejecuta un máximo de 10,000 ejecuciones completas del flujo de usuario 
// (100 VUs * 100 iteraciones por VU).
// Duración: Hasta 10 minutos.

export const options = {
  scenarios: {
    user_auth_info_flow: {
      executor: 'per-vu-iterations',
      vus: 10000,
      iterations: 100,
      maxDuration: '10m',
    },
  },
};

// === FUNCIÓN PRINCIPAL ===
export default function () {
  const user = users[__VU * 100 + __ITER % 100]; // Distribuye los usuarios por VU
  if (!user) {
    console.warn(`No user found for VU: ${__VU}, Iter: ${__ITER}`);
    return;
  }

  let jar = http.cookieJar();
  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org',
    'Referer': 'https://portaltest.harvestful.org/',
    'User-Agent': 'Mozilla/5.0',
  };

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
    });

    if (!ok) {
      authFailures.add(1);
      return;
    }

    const jsessionid = res.cookies['JSESSIONID'][0].value;
    jar.set('https://appservicestest.harvestful.org', 'JSESSIONID', jsessionid);
    userCount.add(1);

    // Paso siguiente: infoUser
    group('infoUser Request', () => {
      const token = res.json('token'); // Asume que el token viene en la respuesta (ajusta si no)

      const infoRes = http.post(
        'https://appservicestest.harvestful.org/app-services-home/infoUser',
        JSON.stringify({ token: token }),
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
        'infoUser has data': (r) => r.body && r.body.length > 0,
      });

      if (!okInfo) {
        infoUserFailures.add(1);
      }
    });
  });

  sleep(1);
}
