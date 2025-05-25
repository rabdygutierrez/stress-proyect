import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// Métricas personalizadas
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

let usersForLogin = [];

export const options = {
  scenarios: {
    concurrency_login_scenario: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 10 },
        { duration: '10m', target: 10 },
        { duration: '2m', target: 0 }
      ],
      gracefulStop: '30s'
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

    const res = http.post('https://appservicestest.harvestful.org/app-services-home/addUser', JSON.stringify({
      user: {
        firstName: `TestFirst${i}`,
        lastName: `TestLast${i}`,
        email,
        password,
        phoneNumber: `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`,
        country: 'US',
        PreferredLanguage: 1,
        sms: true
      }
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'https://portaltest.harvestful.org',
        'Referer': 'https://portaltest.harvestful.org/'
      }
    });

    registerAttempts.add(1);
    registerDuration.add(res.timings.duration);

    if (check(res, { 'User registered': (r) => r.status === 200 || r.status === 201 })) {
      registerSuccessCounter.add(1);
      createdUsers.push({ email, password });
    } else {
      registerFailures.add(1);
    }

    sleep(0.2);
  }

  usersForLogin = createdUsers;
  console.log(createdUsers);
  console.log(res);
  return { users: createdUsers };
}

export default function (data) {
  const users = data.users;
  const user = users[(__VU - 1) % users.length];
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
            token: "vYQRcsGu09saBZyqBpQHa6AfT4ELMFLLYXHuDqFiRKiKP0EkR6GSLsGsR0B2PS1puQaUQZo11ERdENN9KgOncUxOJPxseJBLQVqVCtHVfq7wXhXAP0gZ7YCE0uMftZkd",
            customerId: 671,
            userId: 375103
        }),
        {
            headers: {
                'content-type': 'application/json',
            }
        }
    );

    newSessionDuration.add(newSessionRes.timings.duration);

    if (check(newSessionRes, { 'New Session OK': (r) => r.status === 200 })) {
        newSessionSuccess.add(1);
        // Aquí puedes procesar la respuesta si es necesario
    } else {
        newSessionFailures.add(1);
    }
});

  sleep(1);
}
