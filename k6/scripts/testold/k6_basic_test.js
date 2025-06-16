import http from 'k6/http';
import { check, sleep } from 'k6';


// URL base de nuestro sitio de prueba público
const BASE_URL = 'http://test.k6.io';

// 1. Definición de Opciones de la Prueba
export let options = {
    vus: 5,  // 5 usuarios virtuales concurrentes
    duration: '20s', // La prueba durará 20 segundos

    // Umbrales globales para toda la prueba:
    thresholds: {
        http_req_failed: ['rate<0.01'], // Menos del 1% de las peticiones HTTP deben fallar
        http_req_duration: ['p(95)<300'], // 95% de las peticiones deben durar menos de 300ms (0.3 segundos)
    },
};




// 3. Flujo Principal de la Prueba (Función 'default')
export default function () {
    let navigationStart = Date.now(); // Marcador de tiempo para el inicio de la navegación

    // Grupo 1: Acceder a la página principal
    group('Homepage Access', function () {
        let resHomepage = http.get(`${BASE_URL}/`, {
            tags: { page: 'homepage' }, // Etiqueta para filtrar métricas de la página principal
        });

        check(resHomepage, {
            'Homepage status is 200': (r) => r.status === 200,
            'Homepage contains expected text': (r) => r.body.includes('Welcome to the k6.io demo site!'),
        });
        homepageViews.add(1); // Incrementa el contador de vistas de la página principal
        sleep(1); // Pausa de 1 segundo
    });


    // Grupo 2: Acceder a la página de Contactos
    group('Contacts Page Access', function () {
        let resContacts = http.get(`${BASE_URL}/contacts.php`, {
            tags: { page: 'contacts' }, // Etiqueta para filtrar métricas de la página de contactos
        });

        check(resContacts, {
            'Contacts page status is 200': (r) => r.status === 200,
            'Contacts page contains email form': (r) => r.body.includes('Your email:'),
        });
        contactsPageViews.add(1); // Incrementa el contador de vistas de la página de contactos
        sleep(2); // Pausa de 2 segundos
    });

    // Registra el tiempo total de este ciclo de navegación
    totalNavigationTime.add(Date.now() - navigationStart);

    // Pausa final antes de que el VU pueda repetir el ciclo
    sleep(1);
}