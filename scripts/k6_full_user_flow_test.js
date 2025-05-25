import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// Métricas personalizadas
const newSessionAttempts = new Counter('new_session_attempts');
const newSessionSuccess = new Counter('new_session_success');
const newSessionFailures = new Rate('new_session_failures');
const newSessionDuration = new Trend('new_session_duration');

export const options = {
  scenarios: {
    concurrent_sessions_test: {
      executor: 'constant-arrival-rate',
      rate: 30, // Aquí define el número de sesiones concurrentes por segundo
      timeUnit: '1s',
      duration: '5m',
      preAllocatedVUs: 50,
      maxVUs: 100
    }
  },
  thresholds: {
    'new_session_failures': ['rate<0.01'], // Máximo 1% de fallos permitidos
    'new_session_duration': ['p(95)<1000'], // 95% de las respuestas deben ser <1s
    'http_req_failed': ['rate<0.01'] // Menos de 1% de fallos generales HTTP
  }
};

// Usuarios precargados para la prueba (ejemplo)
const users = [
  {
    email: 'testuser1@example.com',
    userId: 101,
    customerId: 501,
    userAccessToken: 'token1'
  },
  {
    email: 'testuser2@example.com',
    userId: 102,
    customerId: 502,
    userAccessToken: 'token2'
  },
  // Agrega más usuarios reales de prueba aquí
];

export default function () {
  // Selecciona un usuario al azar
  const randomUser = users[Math.floor(Math.random() * users.length)];

  newSessionAttempts.add(1);

  const res = http.post(
    'https://appservicestest.harvestful.org/app-services-live/newSession',
    JSON.stringify({
      token: randomUser.userAccessToken,
      customerId: randomUser.customerId,
      userId: randomUser.userId
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );

  newSessionDuration.add(res.timings.duration);

  check(res, { 'New Session OK': (r) => r.status === 200 }) ?
    newSessionSuccess.add(1) :
    newSessionFailures.add(1);

  sleep(0.2); // Pequeño descanso para no saturar brutalmente
}
