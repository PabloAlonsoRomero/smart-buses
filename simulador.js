import 'dotenv/config';
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set, get, onDisconnect, remove } from "firebase/database";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.VITE_FIREBASE_DATABASE_URL,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// Función para usar una API gratuita (OSRM) que nos da la ruta real por las calles
async function obtenerRutaCalles(origen, destino) {
  // OSRM recibe la coordenada como longitud,latitud
  const url = `https://router.project-osrm.org/route/v1/driving/${origen.lng},${origen.lat};${destino.lng},${destino.lat}?geometries=geojson&overview=full`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.routes && data.routes.length > 0) {
      // Nos regresa un arreglo de puntos [lng, lat] por donde pasa la calle
      return data.routes[0].geometry.coordinates.map(coord => ({ lat: coord[1], lng: coord[0] }));
    }
  } catch (error) {
    console.error("Error obteniendo ruta de calles, usando línea recta...");
  }
  return [origen, destino];
}

// BACKEND DE PROXIMIDAD: Función matemática (Haversine) para medir distancia real en metros
function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Radio de la Tierra en metros
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Devuelve la distancia en metros
}

// 5. CÁLCULO DE ESTIMACIÓN DE TIEMPOS (PROMEDIOS HISTÓRICOS)
// Devuelve la velocidad promedio (km/h) a la que normalmente avanza un camión dependiendo de la hora del día (simulando tráfico)
function obtenerVelocidadHistoricaPromedio() {
  const horaActual = new Date().getHours();
  
  if (horaActual >= 7 && horaActual <= 9) {
    return 15; // Hora pico de la mañana (Tráfico pesado)
  } else if (horaActual >= 13 && horaActual <= 15) {
    return 20; // Salida de escuelas/trabajo (Tráfico medio)
  } else if (horaActual >= 18 && horaActual <= 20) {
    return 18; // Hora pico de la tarde (Tráfico pesado)
  } else {
    return 35; // Horas valle / Noche (Tráfico ligero, rápido)
  }
}

async function iniciarSimulacion() {
  console.log("Iniciando simulador GPS avanzado (Trazado de Calles)...");

  const snapshotPuntos = await get(ref(db, 'puntos_interes'));
  const puntosInteres = snapshotPuntos.val();

  const snapshotRuta = await get(ref(db, 'rutas/A-11'));
  let rutaVal = snapshotRuta.val();
  let rutaA11 = null;

  if (rutaVal) {
    if (rutaVal.paradas) {
      rutaA11 = Object.values(rutaVal.paradas);
    } else if (Array.isArray(rutaVal)) {
      rutaA11 = rutaVal;
    } else if (typeof rutaVal === 'object') {
      rutaA11 = Object.values(rutaVal);
    }
  }

  if (!puntosInteres) {
    console.error("❌ No se encontraron puntos de interés.");
    process.exit(1);
  }

  if (!rutaA11) {
    console.warn("⚠️ No se configuró correctamente la ruta A-11 en Firebase, usando respaldo...");
    rutaA11 = [
      "Parada Avenida Universidad",
      "Parada Puerta 1",
      "Parada Puerta Turismo y Gastronomía",
      "Puerta Entrada Principal"
    ];
  }

  console.log("Calculando la trayectoria real por las calles. Esto tomará unos segundos...");
  
  let rutaCompletaCalles = [];
  let paradasDestino = [];

  // Recorremos cada parada para conectar A con B usando calles reales
  for (let i = 0; i < rutaA11.length; i++) {
    const nombreOrigen = rutaA11[i];
    const nombreDestino = rutaA11[(i + 1) % rutaA11.length];

    if (!puntosInteres[nombreOrigen]) {
      console.error(`❌ ERROR: No se encontró la parada "${nombreOrigen}" en la base de datos (revisa espacios o mayúsculas).`);
      process.exit(1);
    }
    if (!puntosInteres[nombreDestino]) {
      console.error(`❌ ERROR: No se encontró la parada "${nombreDestino}" en la base de datos (revisa espacios o mayúsculas).`);
      process.exit(1);
    }

    const coordOrigen = { lat: parseFloat(puntosInteres[nombreOrigen].lat), lng: parseFloat(puntosInteres[nombreOrigen].lng) };
    const coordDestino = { lat: parseFloat(puntosInteres[nombreDestino].lat), lng: parseFloat(puntosInteres[nombreDestino].lng) };

    const trayectoCalles = await obtenerRutaCalles(coordOrigen, coordDestino);
    
    // Guardamos todos los "puntitos" de la calle y a qué parada se dirigen
    for (let j = 0; j < trayectoCalles.length; j++) {
      const punto = trayectoCalles[j];
      rutaCompletaCalles.push(punto);
      paradasDestino.push(nombreDestino);
    }
  }

  // Pre-calcular la distancia acumulada de la ruta completa para saber la posición exacta de cada parada
  let distanciasPorPunto = [];
  let distanciaAcumulada = 0;
  let distanciasLlegadaParada = {}; // { "Parada 1": 1500m, "Parada 2": 3200m }

  for (let i = 0; i < rutaCompletaCalles.length; i++) {
    if (i > 0) {
      const prev = rutaCompletaCalles[i - 1];
      const curr = rutaCompletaCalles[i];
      distanciaAcumulada += calcularDistanciaMetros(prev.lat, prev.lng, curr.lat, curr.lng);
    }
    distanciasPorPunto.push(distanciaAcumulada);
    
    // Si en el SIGUIENTE punto cambiamos de destino, significa que en ESTE punto llegamos a la parada actual
    const destinoActual = paradasDestino[i];
    const destinoSiguiente = paradasDestino[(i + 1) % rutaCompletaCalles.length];
    
    if (destinoActual !== destinoSiguiente) {
      distanciasLlegadaParada[destinoActual] = distanciaAcumulada;
    }
  }
  const totalDistanciaCircuito = distanciaAcumulada;

  console.log(`✅ ¡Calles mapeadas exitosamente! El circuito tiene ${rutaCompletaCalles.length} micro-puntos.`);
  console.log("Iniciando transmisión de GPS para A-11...");

  let indicePuntoActual = 0;
  // Cambiamos la referencia para soportar múltiples camiones por ruta
  const busRef = ref(db, 'monitoreo/A-11/Camion1 - GHB-014-G');

  // TRUCO PRO: Le decimos a Firebase "Si este script se cierra o se cae el internet, borra este camión de la base de datos automáticamente"
  onDisconnect(busRef).remove();

  // Actualiza la posición cada 800ms
  setInterval(() => {
    const ubicacionActual = rutaCompletaCalles[indicePuntoActual];
    const siguienteParada = paradasDestino[indicePuntoActual];

    // Lógica de Proximidad Exacta
    const distanciaActualBus = distanciasPorPunto[indicePuntoActual];
    const velocidadPromedioKmh = obtenerVelocidadHistoricaPromedio();
    const metrosPorMinuto = (velocidadPromedioKmh * 1000) / 60;
    
    // Generar ETAs para TODAS las paradas basándonos en la distancia real por la ruta
    const etasGlobales = {};
    let estadoActualDelCamion = "En ruta";

    for (const parada of rutaA11) {
      // ¿A qué distancia de la ruta se encuentra esta parada?
      const distanciaDeLaParada = distanciasLlegadaParada[parada];
      
      // ¿Cuánto le falta recorrer al camión para llegar ahí?
      let distanciaFaltante = distanciaDeLaParada - distanciaActualBus;
      if (distanciaFaltante < 0) {
        // Significa que la parada ya quedó atrás, así que el camión tiene que dar toda la vuelta al circuito para volver a llegar
        distanciaFaltante += totalDistanciaCircuito;
      }

      const minutos = Math.ceil(distanciaFaltante / metrosPorMinuto);
      let estadoParada = "En ruta";
      
      // Si está muy cerca y es la parada inmediatamente siguiente
      if (distanciaFaltante <= 50 && parada === siguienteParada) {
        estadoParada = "Llegando a paradero";
        estadoActualDelCamion = "Llegando a paradero"; // El estado principal del camión
      }

      etasGlobales[parada] = {
        minutos: minutos,
        estado: estadoParada
      };
    }

    if (estadoActualDelCamion === "Llegando a paradero") {
      console.log(`🔔 ALERTA DE PROXIMIDAD: Camión llegando a ${siguienteParada}`);
    } else {
      console.log(`[Camion1] Faltan ${etasGlobales[siguienteParada].minutos} min aprox para ${siguienteParada}`);
    }

    // Ahora enviamos la información a la ruta del camión específico
    set(busRef, {
      lat: ubicacionActual.lat.toString(),
      lng: ubicacionActual.lng.toString(),
      velocidad_historica: velocidadPromedioKmh,
      tiempo_estimado_min: etasGlobales[siguienteParada].minutos, 
      siguiente_parada: siguienteParada,
      estado: estadoActualDelCamion,
      etas_completos: etasGlobales // ❤️ ¡Enviamos TODO el arreglo de tiempos exactos al mapa!
    });

    // Avanza al siguiente micro-punto en la calle
    indicePuntoActual = (indicePuntoActual + 1) % rutaCompletaCalles.length;

  }, 800);
}

iniciarSimulacion();
