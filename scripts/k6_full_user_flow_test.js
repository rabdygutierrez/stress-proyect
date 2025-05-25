import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

const registerAttempts = new Counter('user_register_attempts');
const registerSuccessCounter = new Counter('user_register_success');
const registerFailures = new Rate('user_register_failures');
const registerDuration = new Trend('register_duration');

const loginAttempts = new Counter('user_login_attempts');
const loginSuccessCounter = new Counter('user_login_success');
const loginFailures = new Rate('user_login_failures');
const loginDuration = new Trend('login_duration');

const infoUserAttempts = new Counter('info_user_attempts');
const infoUserSuccess = new Counter('info_user_success');
const infoUserFailures = new Rate('info_user_failures');
const infoUserDuration = new Trend('info_user_duration');

const newSessionAttempts = new Counter('new_session_attempts');
const newSessionSuccess = new Counter('new_session_success');
const newSessionFailures = new Rate('new_session_failures');
const newSessionDuration = new Trend('new_session_duration');

export const options = {
  scenarios: {
    constant_rate_scenario: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 usuarios por segundo
      timeUnit: '1s',
      duration: '10m',
      preAllocatedVUs: 20,
      maxVUs: 50
    }
  },
  thresholds: {
    'register_duration': ['p(95)<1000'],
    'user_register_failures': ['rate<0.05'],
    'login_duration': ['p(95)<500'],
    'info_user_duration': ['p(95)<300'],
    'http_req_failed': ['rate<0.01'],
    'user_login_failures': ['rate<0.05'],
    'info_user_failures': ['rate<0.01']
  }
};

export function setup() {
  const createdUsers = [];
  const numUsers = 10;

  for (let i = 0; i < numUsers; i++) {
    const uniqueId = `${Date.now()}_setup_${i}`;
    const email = `k6_user_${uniqueId}@yopmail.com`;
    const password = 'Test123**';
    const firstName = `TestFirst${i}`;
    const lastName = `TestLast${i}`;
    const phoneNumber = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;

    // 1️⃣ Registrar usuario
    const registerRes = http.post(
      'https://appservicestest.harvestful.org/app-services-home/addUser',
      JSON.stringify({
        user: {
          firstName,
          lastName,
          email,
          password,
          phoneNumber,
          country: 'US',
          PreferredLanguage: 1,
          sms: true
        }
      }),
      {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://portaltest.harvestful.org',
          'Referer': 'https://portaltest.harvestful.org/'
        }
      }
    );

    registerAttempts.add(1);
    registerDuration.add(registerRes.timings.duration);

    if (check(registerRes, { 'User registered': (r) => r.status === 200 || r.status === 201 })) {
      registerSuccessCounter.add(1);

      const userId = Math.floor(Math.random() * 10000) + 1000; // Simulado
      const customerId = Math.floor(Math.random() * 10000) + 1000; // Simulado

      // 2️⃣ Consumir app-services-live para obtener el userAccessToken
      const loginRes = http.post(
        'https://appservicestest.harvestful.org/app-services-live/api/your-login-endpoint', // ¡pon aquí el endpoint correcto!
        JSON.stringify({
          // payload que espera ese endpoint para iniciar sesión
          email,
          password
        }),
        {
          headers: {
            'accept': 'application/json, text/plain, */*',
            'accept-language': 'es-419,es;q=0.9',
            'content-type': 'application/json',
            'origin': 'https://portaltest.harvestful.org',
            'referer': 'https://portaltest.harvestful.org/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36'
          }
        }
      );

      let userAccessToken = '';
      if (check(loginRes, { 'Login OK': (r) => r.status === 200 })) {
        try {
          const loginJson = loginRes.json();
          // Ajusta aquí la ruta correcta según el JSON de respuesta real:
          userAccessToken = loginJson.result.authorizationInfo.userAccessToken;
          console.log(`userAccessToken para ${email}: ${userAccessToken}`);
        } catch (err) {
          console.error('Error parseando respuesta de app-services-live:', err);
        }
      } else {
        console.error(`Fallo login para ${email}. Código: ${loginRes.status}`);
      }

      // 3️⃣ Guardar usuario con el userAccessToken obtenido
      createdUsers.push({
        email,
        password,
        userId,
        customerId,
        userAccessToken
      });

    } else {
      registerFailures.add(1);
    }

    sleep(0.2);
  }

  console.log('Usuarios creados:');
  console.log(JSON.stringify(createdUsers, null, 2));

  return { users: createdUsers };
}


export default function (data) {
  const users = data.users;
  const randomIndex = Math.floor(Math.random() * users.length);
  const user = users[randomIndex];
  let authToken = '';

  group('Login', function () {
    loginAttempts.add(1);

    const loginRes = http.post('https://appservicestest.harvestful.org/app-services-home/authenticate', JSON.stringify({
      email: user.email,
      password: user.password
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

    loginDuration.add(loginRes.timings.duration);

    if (check(loginRes, { 'Login OK': (r) => r.status === 200 })) {
      loginSuccessCounter.add(1);
      try {
        const json = loginRes.json();
        if (json.token) {
          authToken = json.token;
        }
      } catch (_) {}
    } else {
      loginFailures.add(1);
      return;
    }
  });

  sleep(1);

  group('InfoUser', function () {
    infoUserAttempts.add(1);

    const infoRes = http.post('https://appservicestest.harvestful.org/app-services-home/infoUser', JSON.stringify({
      token: authToken
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

    infoUserDuration.add(infoRes.timings.duration);

    if (check(infoRes, { 'Info OK': (r) => r.status === 200 })) {
      infoUserSuccess.add(1);
    } else {
      infoUserFailures.add(1);
    }
  });

  group('NewSession', function () {
    newSessionAttempts.add(1);

    const newSessionRes = http.post(
      'https://appservicestest.harvestful.org/app-services-live/newSession',
      JSON.stringify({
        token: userAccessToken,
        customerId: user.customerId,
        userId: user.userId
      }),
      {
        headers: {
          'content-type': 'application/json'
        }
      }
    );

    newSessionDuration.add(newSessionRes.timings.duration);

    if (check(newSessionRes, { 'New Session OK': (r) => r.status === 200 })) {
      newSessionSuccess.add(1);
    } else {
      newSessionFailures.add(1);
    }
  });

  sleep(1);
}
