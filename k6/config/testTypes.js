// D:\Repositorios\k6-full-docker-stack\k6\config\testTypes.js

export const testTypes = {
    "smokeTest": {
        vus: 1,
        duration: '1s'
    },
    "loadTest": {
        thresholds: {
            http_req_failed: ['rate < 0.01'], // http errors should be less than 1%
            http_req_duration: ['p(95) < 1000'],
        },
        stages: [ //Tiempo de ejecución: 101 minutos
            {duration : '30s', target: 10},
            {duration : '120s', target: 10},
            {duration : '30s', target: 20},
            {duration : '120s', target: 20},
            {duration : '30s', target: 30},
            {duration : '120s', target: 30},
            {duration : '30s', target: 40},
            {duration : '120s', target: 40},
            {duration : '30s', target: 50},
            {duration : '120s', target: 50},
            {duration : '30s', target: 60},
            {duration : '120s', target: 60},
            {duration : '30s', target: 70},
            {duration : '120s', target: 70},
            {duration : '30s', target: 80},
            {duration : '120s', target: 80},
            {duration : '30s', target: 90},
            {duration : '120s', target: 90},
            {duration : '30s', target: 100},
            {duration : '120s', target: 100},
            {duration : '30s', target: 110},
            {duration : '120s', target: 110},
            {duration : '30s', target: 120},
            {duration : '120s', target: 120},
            {duration : '30s', target: 130},
            {duration : '120s', target: 130},
            {duration : '30s', target: 140},
            {duration : '120s', target: 140},
            {duration : '30s', target: 150},
            {duration : '120s', target: 150},
            {duration : '30s', target: 160},
            {duration : '120s', target: 160},
            {duration : '30s', target: 170},
            {duration : '120s', target: 170},
            {duration : '30s', target: 180},
            {duration : '120s', target: 180},
            {duration : '30s', target: 190},
            {duration : '120s', target: 190},
            {duration : '30s', target: 200},
            {duration : '120s', target: 200},
            {duration : '30s', target: 210},
            {duration : '120s', target: 210},
            {duration : '30s', target: 220},
            {duration : '120s', target: 220},
            {duration : '30s', target: 230},
            {duration : '120s', target: 230},
            {duration : '30s', target: 240},
            {duration : '120s', target: 240},
            {duration : '30s', target: 250},
            {duration : '120s', target: 250},
            {duration : '30s', target: 260},
            {duration : '120s', target: 260},
            {duration : '30s', target: 270},
            {duration : '120s', target: 270},
            {duration : '30s', target: 280},
            {duration : '120s', target: 280},
            {duration : '30s', target: 290},
            {duration : '120s', target: 290},
            {duration : '30s', target: 300},
            {duration : '120s', target: 300},
            {duration : '30s', target: 310},
            {duration : '120s', target: 310},
            {duration : '30s', target: 320},
            {duration : '120s', target: 320},
            {duration : '30s', target: 330},
            {duration : '120s', target: 330},
            {duration : '30s', target: 340},
            {duration : '120s', target: 340},
            {duration : '30s', target: 350},
            {duration : '120s', target: 350},
            {duration : '30s', target: 360},
            {duration : '120s', target: 360},
            {duration : '30s', target: 370},
            {duration : '120s', target: 370},
            {duration : '30s', target: 380},
            {duration : '120s', target: 380},
            {duration : '30s', target: 390},
            {duration : '120s', target: 390},
            {duration : '30s', target: 400},
            {duration : '120s', target: 400},
            {duration : '60s', target: 0},
        ]
    },
    "stressTest": {
        thresholds: {
            http_req_failed: ['rate < 0.01'], // http errors should be less than 1%
            http_req_duration: ['p(95) < 1000'],
        },
        stages: [ //Tiempo de ejecución: 58 minutos
            {duration : '30s', target: 50},
            {duration : '180s', target: 50},
            {duration : '30s', target: 100},
            {duration : '180s', target: 100},
            {duration : '30s', target: 150},
            {duration : '180s', target: 150},
            {duration : '30s', target: 200},
            {duration : '180s', target: 200},
            {duration : '30s', target: 250},
            {duration : '180s', target: 250},
            {duration : '30s', target: 300},
            {duration : '180s', target: 300},
            {duration : '30s', target: 350},
            {duration : '180s', target: 350},
            {duration : '30s', target: 400},
            {duration : '180s', target: 400},
            {duration : '30s', target: 450},
            {duration : '180s', target: 450},
            {duration : '30s', target: 500},
            {duration : '180s', target: 500},
            {duration : '30s', target: 550},
            {duration : '180s', target: 550},
            {duration : '30s', target: 600},
            {duration : '180s', target: 600},
            {duration : '30s', target: 650},
            {duration : '180s', target: 650},
            {duration : '30s', target: 700},
            {duration : '180s', target: 700},
            {duration : '30s', target: 750},
            {duration : '180s', target: 750},
            {duration : '30s', target: 800},
            {duration : '180s', target: 800},
            {duration : '120s', target: 0},
        ]
    },
    "testK6": {
        thresholds: {
            http_req_failed: ['rate < 0.01'], // http errors should be less than 1%
            http_req_duration: ['p(95) < 1000'],
        },
        stages: [ 
            { duration: '30s', target: 20 }, // Rampa hasta 20 usuarios virtuales en 30 segundos
            { duration: '1m', target: 20 },  // Mantener 20 usuarios virtuales durante 1 minuto
            { duration: '30s', target: 0 },  // Rampa de bajada a 0 usuarios virtuales en 30 segundos
        ],
    },
};