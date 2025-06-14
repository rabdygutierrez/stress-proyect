import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// === MÉTRICAS PERSONALIZADAS ===
const registerAttempts = new Counter('user_register_attempts');
const registerSuccessCounter = new Counter('user_register_success');
const registerFailures = new Rate('user_register_failures');
const registerDuration = new Trend('register_duration');

// === CONFIGURACIÓN DE PRUEBA ===
//Durante los 10 minutos de carga sostenida, tendrás 100 VUs activos. 
// Si cada VU completa una iteración en aproximadamente 1 segundo 
// Total de 100 VUs * 600 segundos = 60,000
const testConfigs = {
  smokeTest: {
    vus: 1,
    duration: '30s',
  },
  loadTest: {
    stages: [
      { duration: '5m', target: 100 },   // Ramp-up a 100 VUs en 5 minutos
      { duration: '10m', target: 100 },  // Mantiene 100 VUs por 10 minutos
      { duration: '1m', target: 0 },     // Ramp-down
    ],
  },
  default: {
    vus: 1,
    duration: '30s',
  },
};

const selectedConfig = __ENV.TYPE_TEST || 'default';
export const options = testConfigs[selectedConfig];

// === FLUJO PRINCIPAL: REGISTRO DE USUARIO ===
export default function () {
  const uniqueId = `${Date.now()}_${__VU}_${__ITER}`;
  const email = `testuser_k6_${uniqueId}@yopmail.com`;
  const firstName = `TestFirstName${uniqueId}`;
  const lastName = `TestLastName${uniqueId}`;
  const phoneNumber = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const password = 'Test123**';

  group('User Registration', function () {
    registerAttempts.add(1);
    const registerStartTime = Date.now();

    const res = http.post(
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
      {
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://portaltest.harvestful.org',
        },
      }
    );

    registerDuration.add(Date.now() - registerStartTime);

    const success = check(res, {
      'User registration successful': (r) => r.status === 200 || r.status === 201,
    });

    if (success) {
      registerSuccessCounter.add(1);
    } else {
      registerFailures.add(1);
    }
  });

  sleep(1);
}
