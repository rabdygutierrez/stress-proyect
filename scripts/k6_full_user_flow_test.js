import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Counter, Trend, Rate } from 'k6/metrics';
import { SharedArray } from 'k6/data'; // Para compartir datos de setup con VUs

// 1. Métricas personalizadas para el registro y el login
// Métricas de Registro
const registerAttempts = new Counter('user_register_attempts');
const registerSuccessCounter = new Counter('user_register_success');
const registerFailures = new Rate('user_register_failures');
const registerDuration = new Trend('register_duration');

// Métricas de Login
const loginAttempts = new Counter('user_login_attempts');
const loginSuccessCounter = new Counter('user_login_success');
const loginFailures = new Rate('user_login_failures');
const loginDuration = new Trend('login_duration');

// Métricas de InfoUser
const infoUserAttempts = new Counter('info_user_attempts');
const infoUserSuccess = new Counter('info_user_success');
const infoUserFailures = new Rate('info_user_failures');
const infoUserDuration = new Trend('info_user_duration');

// SharedArray para almacenar los usuarios creados en setup() y pasarlos a default()
const usersForLogin = new SharedArray('registered_users', function () {
  return []; // Se llenará en setup()
});

// 2. Opciones de la prueba: Escenario de Rampa (Ramping VUs)
export const options = {
  ext: {
    influxdb: {
      address: 'http://50.19.40.139:8086/k6db', // Verificar IP
    },
  },
  scenarios: {
    // Este escenario simulará la carga real de usuarios concurrentes.
    // Los VUs ejecutarán el flujo de login y infoUser con los usuarios creados en setup.
    concurrency_login_scenario: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 10 }, // Rampa de 0 a 10 VUs (usuarios logueándose) en 5 minutos
        { duration: '10m', target: 10 }, // Mantener 10 VUs activos durante 10 minutos
        { duration: '2m', target: 0 },   // Bajar a 0 VUs en 2 minutos
      ],
      gracefulStop: '30s',
      vus: 10, // Número máximo de VUs para este escenario. Debería ser <= número de usuarios creados.
    },
  },
  thresholds: {
    // Umbrales para Registro (si la etapa setup falla, la prueba podría no ejecutarse)
    'register_duration': ['p(95)<1000'],
    'user_register_failures': ['rate<0.05'],

    // Umbrales para Login/InfoUser (concurrencia)
    'login_duration': ['p(95)<500'],
    'info_user_duration': ['p(95)<300'],
    'http_req_failed': ['rate<0.01'],
    'user_login_failures': ['rate<0.05'],
    'info_user_failures': ['rate<0.01'],
  },
};

// 3. Función setup() - Se ejecuta UNA VEZ antes de que comiencen los VUs
// Aquí se registrarán los usuarios que se usarán en la fase de login.
export function setup() {
  console.log('--- SETUP: Iniciando la creación de usuarios para la prueba de carga ---');
  const createdUsers = [];
  // Queremos crear al menos tantos usuarios como el máximo de VUs en nuestro escenario de login.
  const numUsersToCreate = options.scenarios.concurrency_login_scenario.vus;

  for (let i = 0; i < numUsersToCreate; i++) {
    const uniqueId = `${Date.now()}_setup_${i}`;
    const email = `k6_test_user_${uniqueId}@yopmail.com`;
    const firstName = `TestFirstName${uniqueId}`;
    const lastName = `TestLastName${uniqueId}`;
    const phoneNumber = `+1${Math.floor(1000000000 + Math.random() * 9000000000)}`;
    const password = 'Test123**'; // La contraseña QA

    console.log(`(SETUP) Attempting to register user: ${email}`);
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
          'content-type': 'application/json',
          'origin': 'https://portaltest.harvestful.org',
          'referer': 'https://portaltest.harvestful.org/',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
        },
      }
    );

    // Métrica específica para el registro en setup
    registerAttempts.add(1);
    registerDuration.add(Date.now() - registerRes.timings.waiting); // No podemos usar Date.now() para duración aquí si esperamos
                                                                 // varias llamadas. Usamos timings.waiting para la request en sí.

    if (check(registerRes, { 'User registration successful in setup': (r) => r.status === 200 || r.status === 201 })) {
      createdUsers.push({ email: email, password: password });
      registerSuccessCounter.add(1);
      console.log(`(SETUP) SUCCESS: Registered user: ${email}`);
    } else {
      registerFailures.add(1);
      console.error(`(SETUP) FAILURE: Failed to register user ${email}. Status: ${registerRes.status}, Body: ${registerRes.body}`);
      // Si la creación de usuarios es crítica y no puedes continuar sin ellos, lanza un error:
      // throw new Error(`Critical: Failed to register user ${email}, stopping test.`);
    }
    sleep(0.2); // Pequeña pausa para no saturar la API de registro
  }

  // Llenar el SharedArray con los usuarios creados
  usersForLogin.push(...createdUsers);

  console.log(`--- SETUP: ${createdUsers.length} usuarios creados y listos para la prueba de login ---`);
  // El objeto retornado por setup() puede ser pasado a default y teardown.
  // Aquí pasamos los usuarios para que teardown pueda limpiarlos.
  return { usersToClean: createdUsers };
}

// 4. Función principal de la prueba (default) - Se ejecuta por CADA VU
export default function () {
  let success;

  // Cada VU toma un usuario de los creados en setup().
  // __VU es 1-indexado, por eso (__VU - 1). El módulo es para reciclar si hay más VUs que usuarios creados.
  const user = usersForLogin[(__VU - 1) % usersForLogin.length];

  // Comprobación de seguridad: Si por alguna razón no hay usuarios, el VU no hace nada.
  if (!user) {
    console.error(`ERROR (VU ${__VU}): No user found in 'usersForLogin' array. Skipping iteration.`);
    sleep(1);
    return;
  }

  let authToken = ''; // Para almacenar el token de sesión

  // --- Paso 1: Autenticación (POST /authenticate) ---
  group('User Authentication', function () {
    loginAttempts.add(1);
    const authStartTime = Date.now();
    const loginRes = http.post('https://appservicestest.harvestful.org/app-services-home/authenticate',
      JSON.stringify({
        email: user.email,
        password: user.password,
      }),
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'es-419,es;q=0.9,en;q=0.8',
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
    loginDuration.add(Date.now() - authStartTime);

    success = check(loginRes, { 'Authentication successful': (r) => r.status === 200 });
    if (success) {
      loginSuccessCounter.add(1);
      // *** AJUSTA ESTO SEGÚN LA ESTRUCTURA REAL DE TU RESPUESTA DE LOGIN ***
      try {
        const responseBody = loginRes.json();
        if (responseBody && responseBody.token) {
          authToken = responseBody.token;
          // console.log(`(VU ${__VU} - ${user.email}) Logged in. Token obtained.`); // Descomenta para depurar
        } else {
          console.error(`ERROR (VU ${__VU} - ${user.email}): No token field found in login response. Body: ${loginRes.body}`);
          success = false;
        }
      } catch (e) {
        console.error(`ERROR (VU ${__VU} - ${user.email}): Parsing login response failed: ${e}. Body: ${loginRes.body}`);
        success = false;
      }
    } else {
      loginFailures.add(1);
      console.error(`ERROR (VU ${__VU} - ${user.email}): Authentication failed. Status: ${loginRes.status}, Body: ${loginRes.body}`);
    }

    if (!success || !authToken) {
      sleep(1);
      return; // Salir de esta iteración del VU si el login o el token fallan
    }
  }); // Fin User Authentication

  sleep(1); // Pausa entre el login y la siguiente acción

  // --- Paso 2: Obtener Información del Usuario (POST /infoUser) ---
  group('Get User Info', function () {
    infoUserAttempts.add(1);
    const infoUserStartTime = Date.now();
    const infoUserRes = http.post('https://appservicestest.harvestful.org/app-services-home/infoUser',
      JSON.stringify({
        token: authToken, // ¡Aquí usamos el token dinámico obtenido del login!
      }),
      {
        headers: {
          'accept': 'application/json, text/plain, */*',
          'accept-language': 'es-419,es;q=0.9,en;q=0.8',
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
    infoUserDuration.add(Date.now() - infoUserStartTime);

    success = check(infoUserRes, { 'Info user successful': (r) => r.status === 200 });
    if (success) {
      infoUserSuccess.add(1);
    } else {
      infoUserFailures.add(1);
      console.error(`ERROR (VU ${__VU} - ${user.email}): Info User failed. Status: ${infoUserRes.status}, Body: ${infoUserRes.body}`);
    }
  }); // Fin Get User Info

  sleep(1); // Pausa al final de cada iteración completa del VU antes de iniciar la siguiente
}

// *****************OPCIONAL*****************************************************************
// 5. Función teardown() - Se ejecuta UNA VEZ después de que todos los VUs hayan terminado.
// Aquí limpiaremos los usuarios creados en setup(). OPCIONAL **************
export function teardown(data) {
  console.log('--- TEARDOWN: Iniciando limpieza de usuarios de prueba ---');
  if (data && data.usersToClean) {
    for (const user of data.usersToClean) {
      // *** ¡AQUÍ DEBES ESPECIFICAR LA URL Y MÉTODO PARA ELIMINAR UN USUARIO EN TU API! ***
      // Esto es un ejemplo. Si no tienes un endpoint de borrado de usuario, esta sección no funcionará.
      // Reemplaza 'YOUR_DELETE_USER_API_URL_HERE' y el método (DELETE, POST, etc.)
      const deleteRes = http.del(`https://appservicestest.harvestful.org/app-services-home/deleteUser?email=${user.email}`, null, {
        headers: {
            'accept': '*/*',
            'origin': 'https://portaltest.harvestful.org',
            'referer': 'https://portaltest.harvestful.org/',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
            // Si necesitas un token de administrador para borrar usuarios, deberías obtenerlo en setup
            // y pasarlo a teardown, o tener un token estático para limpieza.
        }
      });

      if (check(deleteRes, { 'User deletion successful': (r) => r.status === 200 || r.status === 204 })) {
        console.log(`(TEARDOWN) SUCCESS: Deleted user: ${user.email}`);
      } else {
        console.error(`(TEARDOWN) FAILURE: Failed to delete user ${user.email}. Status: ${deleteRes.status}, Body: ${deleteRes.body}`);
      }
      sleep(0.1); // Pequeña pausa
    }
  } else {
    console.log('(TEARDOWN) No users to clean or data not passed from setup.');
  }
  console.log('--- TEARDOWN: Limpieza completada ---');
}

// Opcional: Para generar un reporte HTML al finalizar la prueba
// export function handleSummary(data) {
//   return {
//     "summary.html": htmlReport(data),
//   };
// }