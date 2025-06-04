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
// Se carga el archivo 'users_10000.json' y se accede al array 'usuarios' dentro de él.
// Este array debe contener al menos 1000 usuarios únicos para que la prueba sea efectiva.
const users = new SharedArray('usuarios', () =>
  JSON.parse(open('./users_10000.json')).usuarios
);

// CONFIGURACIÓN DEL ESCENARIO
export const options = {
  scenarios: {
    user_auth_info_flow: {
      executor: 'per-vu-iterations',
      // Se aumentan los Virtual Users (VUs) a 1000 para simular 1000 usuarios concurrentes.
      vus: 1000,
      // Cada uno de los 1000 VUs realizará el flujo 100 veces.
      // Esto resulta en un total de 1000 * 100 = 100,000 iteraciones.
      iterations: 100,
      // La duración máxima de la prueba se mantiene en 10 minutos.
      maxDuration: '10m',
    },
  },
  // Opcional: Añadir umbrales para que la prueba falle si no se cumplen los SLOs.
  // Ajusta estos valores según los requisitos de rendimiento de tu aplicación.
  thresholds: {
    'http_req_duration': ['p(95)<500'],    // 95% de las solicitudes HTTP en menos de 500ms
    'http_req_failed': ['rate<0.01'],      // Menos del 1% de las solicitudes HTTP deben fallar

    'authentication_failures': ['rate<0.02'], // Menos del 2% de fallos en autenticación
    'authentication_duration': ['p(90)<300', 'p(95)<450'], // 90% en <300ms, 95% en <450ms
    'infoUser_failures': ['rate<0.02'],       // Menos del 2% de fallos en infoUser
    'infoUser_duration': ['p(90)<250', 'p(95)<400'], // 90% en <250ms, 95% en <400ms
  },
};

// FLUJO PRINCIPAL
export default function () {
  // Selecciona un usuario aleatorio del array 'users'.
  // Como 'users' ahora puede tener 10000 usuarios, la probabilidad de repetir es baja.
  const user = users[Math.floor(Math.random() * users.length)];

  // Corrección: Asegura que 'user' se haya seleccionado correctamente.
  // Aunque con SharedArray y un array no vacío, 'user' siempre debería estar definido.
  if (!user) {
    console.warn(`No se encontró un usuario. Esto no debería ocurrir si el archivo JSON es válido.`);
    return;
  }

  // Inicializa un nuevo "tarro de cookies" para cada usuario virtual.
  let jar = http.cookieJar();
  // Define las cabeceras HTTP base para las solicitudes.
  const headersBase = {
    'Content-Type': 'application/json',
    'Origin': 'https://portaltest.harvestful.org',
    'Referer': 'https://portaltest.harvestful.org/',
    'User-Agent': 'Mozilla/5.0',
  };

  // Grupo de pasos: Autenticación del usuario
  group('Authenticate User', () => {
    // Prepara el payload JSON para la solicitud de autenticación.
    const authPayload = JSON.stringify({
      email: user.email,
      password: user.password,
    });

    // Realiza la solicitud POST al endpoint de autenticación.
    const res = http.post(
      'https://appservicestest.harvestful.org/app-services-home/authenticate',
      authPayload,
      { headers: headersBase }
    );

    // Registra la duración de la solicitud de autenticación.
    authDuration.add(res.timings.duration);

    // Realiza verificaciones sobre la respuesta de autenticación.
    const ok = check(res, {
      'auth status 200': (r) => r.status === 200, // Verifica que el estado sea 200 OK
      'auth has Set-Cookie': (r) => !!r.cookies['JSESSIONID'], // Verifica la presencia de la cookie de sesión
      'auth has token': (r) => r.json().result?.token !== undefined, // Verifica que el token esté presente en la respuesta
    });

    // Si alguna verificación de autenticación falla, incrementa el contador de fallos y termina la iteración.
    if (!ok) {
      authFailures.add(1);
      return;
    }

    // Extrae la cookie JSESSIONID y el token de la respuesta.
    const jsessionid = res.cookies['JSESSIONID'][0].value;
    const token = res.json().result.token;

    // Establece la cookie JSESSIONID en el "tarro de cookies" del VU para futuras solicitudes.
    jar.set('https://appservicestest.harvestful.org', 'JSESSIONID', jsessionid);
    // Incrementa el contador de usuarios que han logrado autenticarse.
    userCount.add(1);

    // Grupo de pasos: Solicitud de información del usuario
    group('infoUser Request', () => {
      // Realiza la solicitud POST al endpoint de información del usuario.
      const infoRes = http.post(
        'https://appservicestest.harvestful.org/app-services-home/infoUser',
        JSON.stringify({ token }), // Envía el token en el payload
        {
          headers: {
            ...headersBase,
            'Cookie': `JSESSIONID=${jsessionid}`, // Incluye la cookie de sesión
          },
        }
      );

      // Registra la duración de la solicitud de información del usuario.
      infoUserDuration.add(infoRes.timings.duration);

      // Realiza verificaciones sobre la respuesta de información del usuario.
      const okInfo = check(infoRes, {
        'infoUser 200': (r) => r.status === 200, // Verifica que el estado sea 200 OK
        'infoUser has data': (r) => !!r.body && r.body.length > 10, // Verifica que el cuerpo de la respuesta contenga datos
      });

      // Si alguna verificación de información del usuario falla, incrementa el contador de fallos.
      if (!okInfo) infoUserFailures.add(1);
    });
  });

  // Pausa de 1 segundo entre iteraciones para simular un comportamiento de usuario más realista.
  sleep(1);
}