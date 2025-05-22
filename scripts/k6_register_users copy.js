import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';

// 1. Métricas personalizadas para el registro
const registerAttempts = new Counter('user_register_attempts');
const registerSuccessCounter = new Counter('user_register_success');
const registerFailures = new Rate('user_register_failures');
const registerDuration = new Trend('register_duration');

// 2. Opciones de la prueba: Escenario de Rampa (Ramping VUs) para el registro
export const options = {
  // ext: {
  //   influxdb: {
  //     address: 'http://50.19.40.139:8086/k6db', // <-- ¡CONFIRMA ESTA IP!
  //   },
  // },
  scenarios: {
    // Rampa de 0 a 10 usuarios de registro en 5 minutos
    // Puedes ajustar el 'target' y la 'duration' según la cantidad de usuarios que necesites crear
    // y la velocidad a la que quieras crearlos.
    register_ramp_scenario: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 15 }, // Rampa de 0 a 15 VUs registrando usuarios
        { duration: '1m', target: 15 }, // Mantener 15 VUs registrando por un minuto más (opcional)
        { duration: '1m', target: 0 },  // Bajar a 0 VUs
      ],
      gracefulStop: '30s',
      vus: 15, // Número máximo de VUs para este escenario
    },
  },
  // Umbrales para el registro
  thresholds: {
    'register_duration': ['p(95)<1000'], // 95% de registros en menos de 1 segundo
    'http_req_failed': ['rate<0.01'], // Menos del 1% de fallos HTTP globales
    'user_register_failures': ['rate<0.05'], // Menos del 5% de fallos específicos de registro
  },
};

// 3. Función principal de la prueba (lo que cada usuario virtual hará repetidamente)
export default function () {
  let success;

  // Generar datos únicos para cada intento de registro
  // Usamos Date.now() y __VU (ID del VU) para asegurar la unicidad
  const uniqueId = `${Date.now()}_${__VU}_${__ITER}`; // __ITER es la iteración actual del VU
  const email = `testuser_k6_${uniqueId}@yopmail.com`;
  const firstName = `TestFirstName${uniqueId}`;
  const lastName = `TestLastName${uniqueId}`;
  const phoneNumber = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`; // Número de teléfono aleatorio
  const password = 'Test123**'; // Contraseña QA

  // --- Paso 1: Registro de Usuario (POST /addUser) ---
  group('User Registration', function () {
    registerAttempts.add(1);
    const registerStartTime = Date.now();

    const registerRes = http.post('https://appservicestest.harvestful.org/app-services-home/addUser',
      JSON.stringify({
        user: {
          firstName: firstName,
          lastName: lastName,
          email: email,
          password: password,
          phoneNumber: phoneNumber,
          country: 'US',
          PreferredLanguage: 1, 
          sms: true,
        }
      }),
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          'credentials': 'include',
          'origin': 'https://portaltest.harvestful.org',
          'priority': 'u=1, i',
          'referer': 'https://portaltest.harvestful.org/',
          'sec-ch-ua': '"Chromium";v="136", "Google Chrome";v="136", "Not.A/Brand";v="99"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        },
      }
    );
    registerDuration.add(Date.now() - registerStartTime);

    // Verificar el estado de la respuesta. Un registro exitoso suele ser 200 OK o 201 Created.
    success = check(registerRes, { 'User registration successful': (r) => r.status === 200 || r.status === 201 });
    if (success) {
      registerSuccessCounter.add(1);
      console.log(`SUCCESS: Registered user: ${email}`); // Muestra el email del usuario creado
    } else {
      registerFailures.add(1);
      console.error(`ERROR: Registration failed for user ${email}. Status: ${registerRes.status}, Body: ${registerRes.body}`);
    }
  }); // Fin User Registration group

  sleep(1); // Pausa al final de cada iteración del VU
}