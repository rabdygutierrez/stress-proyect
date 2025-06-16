import http from 'k6/http';
import { check } from 'k6';

/**
 * Realiza una solicitud GET al endpoint principal de test.k6.io.
 * @returns {Object} El objeto de respuesta de K6.
 */
export function getK6Test(baseURL) {
    const url = `${baseURL}/`; 
    const params = {
        headers: {
        'Content-Type': 'text/html', 
    },
    // Añade tags específicos para esta solicitud si lo deseas.
    // Esto es útil para agrupar métricas en Grafana de forma más granular.
    /*tags: {
      name: 'GetK6TestPage', // Nombre descriptivo para esta solicitud en las métricas de K6
      endpoint_path: '/',     // Puedes añadir el path como otra etiqueta si es relevante
    },*/
  };

  const res = http.get(url, params);

  // Checks específicos para esta solicitud
  check(res, {
    'GET / status is 200': (r) => r.status === 200,
    'GET / body size is > 0': (r) => r.body.length > 0,
  });

  return res;
}
