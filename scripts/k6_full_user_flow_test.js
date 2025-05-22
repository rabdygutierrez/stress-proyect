import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Métricas
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

const usersForLogin = new SharedArray('registered_users', function () {
  return []; // se llena en setup
});

// Configuración dinámica para Docker
export const options = {
  scenarios: {
    concurrent_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 10 },
        { duration: '5m', target: 10 },
        { duration: '1m', target: 0 },
      ],
      gracefulStop: '30s',
      vus: 10,
    },
  },
  thresholds: {
    'register_duration': ['p(95)<1000'],
    'user_register_failures': ['rate<0.05'],
    'login_duration': ['p(95)<500'],
    'info_user_duration': ['p(95)<300'],
    'http_req_failed': ['rate<0.01'],
    'user_login_failures': ['rate<0.05'],
    'info_user_failures': ['rate<0.01'],
  },
};

export function setup() {
  const createdUsers = [];
  const numUsers = options.scenarios.concurrent_users.vus;

  for (let i = 0; i < numUsers; i++) {
    const uniqueId = `${Date.now()}_setup_${i}`;
    const email = `k6_test_user_${uniqueId}@yopmail.com`;
    const firstName = `TestFirstName${uniqueId}`;
    const lastName = `TestLastName${uniqueId}`;
    const phoneNumber = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const password = 'Test123**';

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
          sms: true,
        },
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    registerAttempts.add(1);
    registerDuration.add(registerRes.timings.duration);

    if (check(registerRes, { 'Registro exitoso': (r) => r.status === 200 || r.status === 201 })) {
      createdUsers.push({ email, password });
      registerSuccessCounter.add(1);
    } else {
      registerFailures.add(1);
    }

    sleep(0.2);
  }

  usersForLogin.push(...createdUsers);
  return { usersToClean: createdUsers };
}

export default function () {
  const user = usersForLogin[(__VU - 1) % usersForLogin.length];
  if (!user) {
    console.error('No hay usuarios disponibles');
    return;
  }

  let authToken = '';

  group('Autenticación', function () {
    loginAttempts.add(1);
    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate',
      JSON.stringify({ email: user.email, password: user.password }),
      { headers: { 'Content-Type': 'application/json' } }
    );

    loginDuration.add(res.timings.duration);
    const ok = check(res, { 'Login exitoso': (r) => r.status === 200 });

    if (ok) {
      loginSuccessCounter.add(1);
      try {
        const body = res.json();
        authToken = body.token || '';
      } catch (_) {
        loginFailures.add(1);
      }
    } else {
      loginFailures.add(1);
    }
  });

  sleep(1);

  if (!authToken) return;

  group('Info del usuario', function () {
    infoUserAttempts.add(1);
    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/infoUser',
      JSON.stringify({ token: authToken }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    infoUserDuration.add(res.timings.duration);
    check(res, { 'Info user OK': (r) => r.status === 200 })
      ? infoUserSuccess.add(1)
      : infoUserFailures.add(1);
  });

  sleep(1);
}
