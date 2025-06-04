import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Trend, Rate } from 'k6/metrics';

// MÉTRICAS PERSONALIZADAS
const authFailures = new Rate('authentication_failures');
const authDuration = new Trend('authentication_duration');
const infoUserFailures = new Rate('infoUser_failures');
const infoUserDuration = new Trend('infoUser_duration');
const userCount = new Counter('users_tested');

// CARGA DE USUARIOS
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10.json'))
);

// CONFIGURACIÓN DEL ESCENARIO
export const options = {
  scenarios: {
    user_auth_info_flow: {
      executor: 'per-vu-iterations',
      vus: 100,
      iterations: 100,
      maxDuration: '10m',
    },
  },
};

// FLUJO PRINCIPAL
export default function () {
const user = users[Math.floor(Math.random() * users.length)];


  if (!user) {
    console.warn(`No user found at index ${userIndex}`);
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
      'auth has token': (r) => r.json().result?.token !== undefined,
    });

    if (!ok) {
      authFailures.add(1);
      return;
    }

    const jsessionid = res.cookies['JSESSIONID'][0].value;
    const token = res.json().result.token;

    jar.set('https://appservicestest.harvestful.org', 'JSESSIONID', jsessionid);
    userCount.add(1);

    group('infoUser Request', () => {
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

      if (!okInfo) infoUserFailures.add(1);
    });
  });

  sleep(1);
}
