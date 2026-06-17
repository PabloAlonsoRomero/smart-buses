<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { db, auth } from '../lib/firebase.js';
  import { ref, onValue, set, push } from 'firebase/database';
  import { Locate, BusFront, Map as MapIcon, Image as ImageIcon, XCircle, Building, Search, ShieldAlert, AlertTriangle } from 'lucide-svelte';

  import MapLegend from '../components/MapLegend.svelte';
  import SafeCommuteAlert from '../components/SafeCommuteAlert.svelte';
  import SOSModal from '../components/SOSModal.svelte';
  import IncidenciaModal from '../components/IncidenciaModal.svelte';

  export let initialFocusLocation = null;
  export let initialFocusRoute = null;
  export let initialRoutePlanner = null;

  $: if (initialRoutePlanner) {
    routeMode = true;
    origenQuery = initialRoutePlanner.origen;
    destinoQuery = initialRoutePlanner.destino;
    activeSearchField = null;
    setTimeout(() => calculateRoute(origenQuery, destinoQuery), 500);
    initialRoutePlanner = null;
  }

  let mapContainer;
  let map;
  
  let darkLayer, satelliteLayer;
  let satelliteMode = false;
  let hasActiveRoute = false;

  let stopMarkers = {};
  let puntosInteresData = {};
  let rutasData = {};
  let liveBusesData = {};
  
  window.renderPopups = () => {
    // Re-render stop popups to update star icon
    Object.keys(stopMarkers).forEach(stopName => {
      const stop = stopMarkers[stopName];
      if (stop.currentType === "Parada de Autobús") {
        const popupHtml = `
          <div class="popup-content">
            <h3 style="margin-top:0; margin-bottom: 8px; color: #f1f5f9;">
              ${stopName}
            </h3>
            <span class="popup-type" style="background-color: #6366f1;">Parada de Autobús</span>
            <div id="eta-container-${stopName.replace(/\s+/g, '-')}">
              <div style="margin-top: 8px; font-size: 13px; color: #94a3b8;">Cargando tiempos...</div>
            </div>
            <button class="popup-btn popup-btn-route" onclick="window.drawRouteToStop('${stopName}')" style="margin-top: 12px; width: 100%;">📍 Trazar ruta desde aquí</button>
            <button class="popup-btn" onclick="window.openIncidenciaModal('${stopName}')" style="margin-top: 8px; width: 100%; background: linear-gradient(135deg, #f59e0b, #d97706);"><span style="margin-right:6px">⚠️</span> Reportar Incidencia</button>
          </div>
        `;
        stop.marker.setPopupContent(popupHtml);
      }
    });
  };

  let sosActive = false;
  let sosCountdown = 3;
  let sosInterval = null;

  let safeCommuteActive = false;
  let safeCommuteTimeout = null;
  let safeCommuteFinished = false;

  let showIncidenciaModal = false;
  let incidenciaUbicacion = '';
  let enviandoIncidencia = false;

  window.openIncidenciaModal = (stopName) => {
    showIncidenciaModal = true;
    incidenciaUbicacion = stopName;
  };

  const closeIncidenciaModal = () => {
    showIncidenciaModal = false;
  };

  const reportarIncidencia = async (event) => {
    const { tipo, descripcion } = event.detail;
    if (!descripcion) {
      alert("Por favor añade una breve descripción.");
      return;
    }
    enviandoIncidencia = true;
    try {
      const incRef = push(ref(db, 'incidencias'));
      await set(incRef, {
        tipo: tipo,
        ubicacion: incidenciaUbicacion,
        descripcion: descripcion,
        fecha: new Date().toISOString(),
        usuario: auth.currentUser ? auth.currentUser.email : 'Anónimo'
      });
      alert('Incidencia reportada correctamente. ¡Gracias por ayudar a la comunidad!');
      closeIncidenciaModal();
    } catch (err) {
      console.error(err);
      alert('Error al reportar la incidencia.');
    } finally {
      enviandoIncidencia = false;
    }
  };

  const triggerSOS = () => {
    sosActive = true;
    sosCountdown = 3;
    sosInterval = setInterval(() => {
      sosCountdown--;
      if (sosCountdown <= 0) {
        clearInterval(sosInterval);
        sendSOSAlert();
      }
    }, 1000);
  };

  const cancelSOS = () => {
    sosActive = false;
    clearInterval(sosInterval);
  };

  const sendSOSAlert = async () => {
    sosActive = false;
    if (!auth.currentUser) return;
    try {
      const alertRef = push(ref(db, 'alertas_seguridad'));
      await set(alertRef, {
        uid: auth.currentUser.uid,
        timestamp: new Date().toISOString(),
        location: userLocationMarker ? userLocationMarker.getLatLng() : 'Ubicación desconocida'
      });
      alert('⚠️ ALERTA ENVIADA. Tu ubicación ha sido registrada. Mantén la calma, la seguridad está en camino.');
    } catch (err) {
      console.error(err);
    }
  };

  const toggleSafeCommute = () => {
    if (safeCommuteActive) {
      safeCommuteActive = false;
      clearTimeout(safeCommuteTimeout);
    } else {
      safeCommuteActive = true;
      safeCommuteFinished = false;
      // Simular llegada después de 8 segundos
      safeCommuteTimeout = setTimeout(() => {
        safeCommuteActive = false;
        safeCommuteFinished = true;
        if (auth.currentUser) {
          const notifRef = push(ref(db, 'notificaciones_seguridad'));
          set(notifRef, {
            uid: auth.currentUser.uid,
            timestamp: new Date().toISOString(),
            tipo: 'llegada_segura',
            mensaje: 'El usuario ha llegado a su destino de forma segura.'
          });
        }
        setTimeout(() => safeCommuteFinished = false, 5000);
      }, 8000);
    }
  };

  function getSentido(routeId, info) {
    if (info.sentido) return info.sentido;
    if (info.variante) return info.variante;
    
    if (info.siguiente_parada && rutasData[routeId] && !Array.isArray(rutasData[routeId])) {
      for (const variante in rutasData[routeId]) {
        const paradas = rutasData[routeId][variante];
        if (Array.isArray(paradas) && paradas.includes(info.siguiente_parada)) {
          return variante;
        }
      }
    }
    return "Desconocido";
  }

  function getCoords(coordsObj) {
    if (typeof coordsObj === 'string') {
      const [lat, lng] = coordsObj.split(',');
      return { lat: parseFloat(lat), lng: parseFloat(lng) };
    }
    if (coordsObj && coordsObj.lat !== undefined) {
      return { lat: parseFloat(coordsObj.lat), lng: parseFloat(coordsObj.lng) };
    }
    return { lat: NaN, lng: NaN };
  }

  function clearRoute() {
    if (window.currentRouteLine) map.removeLayer(window.currentRouteLine);
    if (window.currentWalkingLine) map.removeLayer(window.currentWalkingLine);
    if (window.currentWalkingLine2) map.removeLayer(window.currentWalkingLine2);
    if (window.currentBusLine) map.removeLayer(window.currentBusLine);
    if (window.fullRouteLine) map.removeLayer(window.fullRouteLine);
    window.currentRouteLine = null;
    window.currentWalkingLine = null;
    window.currentWalkingLine2 = null;
    window.currentBusLine = null;
    window.fullRouteLine = null;
    hasActiveRoute = false;
  }

  function toggleSatellite() {
    if (!map) return;
    satelliteMode = !satelliteMode;
    if (satelliteMode) {
      map.removeLayer(darkLayer);
      satelliteLayer.addTo(map);
    } else {
      map.removeLayer(satelliteLayer);
      darkLayer.addTo(map);
    }
  }

  // Fix Leaflet's default icon paths (common issue with bundlers)
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });

  onMount(() => {

    // Initialize the map centered on a default location
    map = L.map(mapContainer, {
      zoomControl: false,
    }).setView([21.1520, -101.7115], 15); // León, Guanajuato (Campus La Salle) as default

    // Dark-themed tile layer for a modern look
    darkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    });

    // Satellite layer for realistic view
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    });

    darkLayer.addTo(map);

    // Custom zoom control in bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Evento de clic derecho para obtener coordenadas
    map.on('contextmenu', function(e) {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      
      const popupHtml = `
        <div class="popup-content" style="text-align: center; min-width: 150px;">
          <strong style="color: #6366f1;">📍 Coordenadas</strong>
          <span class="popup-line" style="user-select: all; font-family: monospace; background: rgba(255,255,255,0.1); padding: 6px; border-radius: 6px; display: block; margin: 8px 0; font-size: 12px; text-align: left;">
            "lat": "${lat}",<br>"lng": "${lng}"
          </span>
          <span style="font-size: 11px; color: #94a3b8;">(Selecciona el texto para copiar)</span>
        </div>
      `;
      
      L.popup()
        .setLatLng(e.latlng)
        .setContent(popupHtml)
        .openOn(map);
    });

    // Function to create custom colored icons
    const createIcon = (color1, color2, svgHtml) => L.divIcon({
      className: 'bus-marker',
      html: `<div class="bus-marker-inner" style="background: linear-gradient(135deg, ${color1}, ${color2}); box-shadow: 0 0 12px ${color1}80, 0 2px 8px rgba(0, 0, 0, 0.3);">
               ${svgHtml}
             </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const svgBus = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 19v2"/></svg>`;

    const svgGate = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 20V6a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14"/><path d="M2 20h20"/><path d="M14 12v.01"/></svg>`;
    const svgBuilding = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M12 6h.01"/><path d="M12 10h.01"/><path d="M12 14h.01"/><path d="M16 10h.01"/><path d="M16 14h.01"/><path d="M8 10h.01"/><path d="M8 14h.01"/></svg>`;

    const iconPuerta = createIcon('#ec4899', '#f43f5e', svgGate); // Rosa/Rojo
    const iconParada = createIcon('#22d3ee', '#3b82f6', svgBus); // Cyan/Azul
    const iconEdificio = createIcon('#10b981', '#059669', svgBuilding); // Esmeralda/Verde
    const iconDefault = createIcon('#6366f1', '#a855f7', svgBus); // Indigo/Morado

    // Layer group for dynamic markers
    const markersGroup = L.layerGroup().addTo(map);

    const puntosRef = ref(db, 'puntos_interes');
    const rutasRef = ref(db, 'rutas');

    onValue(rutasRef, (snapshot) => {
      if (snapshot.val()) rutasData = snapshot.val();
    });

    onValue(puntosRef, (snapshot) => {
      markersGroup.clearLayers();
      for (const key in stopMarkers) delete stopMarkers[key];
      const data = snapshot.val();
      if (data) {
        puntosInteresData = data;
        Object.entries(data).forEach(([name, coords]) => {
          const { lat, lng } = getCoords(coords);
          if (!isNaN(lat) && !isNaN(lng)) {
            let currentIcon = iconDefault;
            let currentType = "Punto de Interés";
            
            const lowerName = name.toLowerCase();
            if (lowerName.includes("parada")) {
              currentIcon = iconParada;
              currentType = "Parada de Autobús";
            } else if (lowerName.includes("puerta") || lowerName.includes("entrada")) {
              currentIcon = iconPuerta;
              currentType = "Puerta / Acceso";
            } else if (lowerName.includes("edificio") || lowerName.includes("biblioteca") || lowerName.includes("rectoria") || lowerName.includes("rectoría")) {
              currentIcon = iconEdificio;
              currentType = "Edificio Campus";
            }

            const marker = L.marker([lat, lng], { icon: currentIcon }).addTo(markersGroup);
            
            stopMarkers[name] = { marker, currentType };

            let extraHtml = "";
            if (currentType === "Parada de Autobús") {
              extraHtml = `<div style="margin-top: 8px; font-size: 13px; color: #94a3b8;">Calculando rutas próximas...</div>`;
            }

            marker.bindPopup(`
                <div class="popup-content">
                  <strong>${name}</strong>
                  <span class="popup-line">${currentType}</span>
                  ${extraHtml}
                </div>
              `);
          }
        });
        
        // Centrar mapa
        const keys = Object.keys(data);
        if (initialFocusLocation) {
          let lat = initialFocusLocation.lat;
          let lng = initialFocusLocation.lng;
          
          if (lat === undefined || lng === undefined) {
             const coordsData = puntosInteresData[initialFocusLocation.name];
             if (coordsData) {
               const parsed = getCoords(coordsData);
               lat = parsed.lat;
               lng = parsed.lng;
             }
          }

          if (lat !== undefined && !isNaN(lat)) {
            map.setView([lat, lng], 18);
            if (stopMarkers[initialFocusLocation.name]) {
              setTimeout(() => {
                stopMarkers[initialFocusLocation.name].marker.openPopup();
              }, 500);
            }
          }
        } else if (initialFocusRoute) {
          setTimeout(() => {
            if (window.currentRouteLine) map.removeLayer(window.currentRouteLine);
            if (window.currentWalkingLine) map.removeLayer(window.currentWalkingLine);
            if (window.currentWalkingLine2) map.removeLayer(window.currentWalkingLine2);
            if (window.currentBusLine) map.removeLayer(window.currentBusLine);
            if (window.fullRouteLine) map.removeLayer(window.fullRouteLine);

            const routeCoords = [];
            initialFocusRoute.paradas.forEach(stopName => {
              const coords = puntosInteresData[stopName];
              const parsed = getCoords(coords);
              if (!isNaN(parsed.lat) && !isNaN(parsed.lng)) {
                routeCoords.push([parsed.lat, parsed.lng]);
              }
            });

            if (routeCoords.length > 1) {
              hasActiveRoute = true;
              // Convertir a formato OSRM: longitud,latitud;longitud,latitud
              const waypoints = routeCoords.map(c => `${c[1]},${c[0]}`).join(';');
              const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;
              
              fetch(url)
                .then(res => res.json())
                .then(routeData => {
                  let finalCoords = routeCoords; // Fallback
                  if (routeData.routes && routeData.routes.length > 0) {
                    // OSRM devuelve [longitud, latitud], Leaflet usa [latitud, longitud]
                    finalCoords = routeData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
                  }

                  window.fullRouteLine = L.polyline(finalCoords, {
                    color: '#8b5cf6', // Morado llamativo
                    weight: 6,
                    opacity: 0.9,
                    lineCap: 'round',
                    lineJoin: 'round'
                  }).addTo(map);

                  map.fitBounds(window.fullRouteLine.getBounds(), { padding: [50, 50] });
                  
                  L.popup()
                    .setLatLng(routeCoords[Math.floor(routeCoords.length / 2)])
                    .setContent(`<div style="text-align: center;"><strong style="color: #8b5cf6;">🚌 Ruta ${initialFocusRoute.name}</strong><br><span style="font-size: 12px; color: #94a3b8;">Trayecto completo</span></div>`)
                    .openOn(map);
                })
                .catch(err => {
                  console.error("Error al obtener la ruta de calles:", err);
                  // Fallback a línea recta si no hay internet o falla OSRM
                  window.fullRouteLine = L.polyline(routeCoords, {
                    color: '#8b5cf6', weight: 6, opacity: 0.9, lineCap: 'round', lineJoin: 'round'
                  }).addTo(map);
                  map.fitBounds(window.fullRouteLine.getBounds(), { padding: [50, 50] });
                });
            } else {
              alert("No hay suficientes coordenadas para trazar esta ruta.");
            }
          }, 500);
        } else if (keys.length > 0) {
          const firstPoint = data[keys[0]];
          const parsed = getCoords(firstPoint);
          if (!isNaN(parsed.lat)) map.setView([parsed.lat, parsed.lng], 15);
        }
      }
    });

    // Read "monitoreo" to update bus positions in real time
    const monitoreoRef = ref(db, 'monitoreo');
    const busesGroup = L.layerGroup().addTo(map);
    const liveBuses = {}; // Keep track of markers by unit ID

    // We can create a special icon for the live bus with the animated class
    const iconLiveBus = L.divIcon({
      className: 'bus-marker animated-bus',
      html: `<div class="bus-marker-inner" style="background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 0 12px #f59e0b80, 0 2px 8px rgba(0, 0, 0, 0.3);">
               ${svgBus}
             </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    onValue(monitoreoRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const currentActiveUnits = [];
        const etaPorParada = {}; // Map to store which buses are arriving to which stop
        
        // La nueva estructura es: monitoreo -> ruta -> camion
        Object.entries(data).forEach(([routeId, busesData]) => {
          Object.entries(busesData).forEach(([unitId, info]) => {
            const globalUnitId = `${routeId}_${unitId}`;
            currentActiveUnits.push(globalUnitId);

            const lat = parseFloat(info.lat);
            const lng = parseFloat(info.lng);
            
            if (!isNaN(lat) && !isNaN(lng)) {
              const popupHtml = `
                  <div class="popup-content">
                    <strong>🚌 Ruta ${routeId}</strong>
                    <span class="popup-line">${unitId}</span>
                    <span class="popup-line" style="color: #f59e0b; font-weight: bold;">
                      ⏱ ETA: Aprox. ${info.tiempo_estimado_min || '?'} min (basado en historial)
                    </span>
                    <span class="popup-line" style="color: ${info.estado === 'Llegando a paradero' ? '#ef4444' : '#22c55e'}; font-weight: bold;">
                      Estado: ${info.estado || 'En ruta'} (${info.distancia_metros ? info.distancia_metros + 'm' : 'Calculando...'})
                    </span>
                    <span class="popup-line" style="color: #cbd5e1;">Sentido: ${getSentido(routeId, info)}</span>
                    <span class="popup-line">Próxima parada: ${info.siguiente_parada || 'Desconocido'}</span>
                    <button class="popup-btn popup-btn-route" onclick="window.drawLiveBusRoute('${routeId}', '${unitId}')" style="margin-top: 8px;">
                      📍 Trazar ruta del camión
                    </button>
                  </div>
                `;
              
              if (!liveBusesData[routeId]) liveBusesData[routeId] = {};
              liveBusesData[routeId][unitId] = info;
              
              if (liveBuses[globalUnitId]) {
                liveBuses[globalUnitId].setLatLng([lat, lng]);
                liveBuses[globalUnitId].setPopupContent(popupHtml);
              } else {
                const marker = L.marker([lat, lng], { icon: iconLiveBus, zIndexOffset: 1000 })
                  .addTo(busesGroup)
                  .bindPopup(popupHtml);
                liveBuses[globalUnitId] = marker;
              }

              // (La lógica del ETA se calculará más abajo para que todas las paradas muestren un tiempo)
            }
          });
        });

        // 1. Remove units from the map that are no longer in Firebase
        Object.keys(liveBuses).forEach(globalUnitId => {
          if (!currentActiveUnits.includes(globalUnitId)) {
            busesGroup.removeLayer(liveBuses[globalUnitId]);
            delete liveBuses[globalUnitId];
          }
        });

        // 1. Update stop popups with ETA information SOLO para Paradas de Autobús y agregar botón a TODOS
        Object.keys(stopMarkers).forEach(stopName => {
          const stop = stopMarkers[stopName];
          
          let etaHtml = "";

          // Solo para paradas, calcular ETA
          if (stop.currentType === "Parada de Autobús") {
            let proximos = [];
            Object.entries(data).forEach(([routeId, busesData]) => {
              Object.entries(busesData).forEach(([unitId, info]) => {
                if (info.etas_completos && info.etas_completos[stopName]) {
                  const etaInfo = info.etas_completos[stopName];
                  proximos.push({
                    ruta: routeId,
                    minutos: etaInfo.minutos,
                    estado: etaInfo.estado,
                    info: info
                  });

                  if (stopName === window.trackedStartStop && !window.hasNotifiedStartStop && etaInfo.estado === 'Llegando a paradero') {
                    window.hasNotifiedStartStop = true;
                    const title = '¡Tu autobús está llegando!';
                    const body = `El autobús de la ruta ${routeId} está llegando a tu parada inicial (${stopName}).`;
                    if ("Notification" in window && Notification.permission === "granted") {
                      new Notification(title, { body });
                    } else {
                      alert(title + "\\n" + body);
                    }
                  }
                }
              });
            });
            
            etaHtml = `<div style="margin-top: 8px; font-size: 13px; color: #94a3b8;">Esperando información de rutas...</div>`;
            
            if (proximos.length > 0) {
              proximos.sort((a, b) => a.minutos - b.minutos);
              
              etaHtml = `<div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">`;
              proximos.forEach(p => {
                const color = p.estado === 'Llegando a paradero' ? '#ef4444' : '#22c55e';
                const timeText = p.estado === 'Llegando a paradero' ? '¡Llegando!' : p.minutos + ' min aprox';
                const sentidoText = getSentido(p.ruta, p.info);
                
                etaHtml += `
                  <div style="margin-bottom: 8px; border-bottom: 1px dashed rgba(255,255,255,0.05); padding-bottom: 6px;">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                      <strong style="color: #6366f1;">Ruta ${p.ruta}</strong> 
                      <span style="color: ${color}; font-weight: 600; font-size: 13px;">
                        ${timeText}
                      </span>
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 2px; line-height: 1.2;">
                      Hacia: ${sentidoText}
                    </div>
                  </div>
                `;
              });
              etaHtml += `</div>`;
            }
          }

          // Botón de ruta para TODOS los puntos
          const stopCoords = stop.marker.getLatLng();
          etaHtml += `
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
              <button onclick="window.activateRouteMode('${stopName.replace(/'/g, "\\'")}')" style="display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; background: #6366f1; color: white; padding: 8px 0; border-radius: 8px; border: none; cursor: pointer; text-decoration: none; font-size: 13px; font-weight: 600; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"></polygon></svg>
                Cómo llegar
              </button>
              ${stop.currentType === "Parada de Autobús" ? `
              <button onclick="window.openIncidenciaModal('${stopName.replace(/'/g, "\\'")}')" style="display: flex; align-items: center; justify-content: center; gap: 6px; width: 100%; background: #f59e0b; color: white; padding: 8px 0; border-radius: 8px; border: none; cursor: pointer; text-decoration: none; font-size: 13px; font-weight: 600; box-shadow: 0 2px 8px rgba(245, 158, 11, 0.4);">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                Reportar Incidencia
              </button>
              ` : ''}
            </div>
          `;

          stop.marker.setPopupContent(`
            <div class="popup-content">
              <strong>${stopName}</strong>
              <span class="popup-line">${stop.currentType}</span>
              ${etaHtml}
            </div>
          `);
        });
        
        window.activateRouteMode = (destinationName) => {
          map.closePopup();
          routeMode = true;
          destinoQuery = destinationName;
          origenQuery = "";
          // Esperamos a que el usuario introduzca un origen
        };

        // Ensure we assign it to the Svelte variable for the search functionality
        puntosInteres = puntosInteresData;

        // 1. Remove units from the map that are no longer in Firebase
        Object.keys(liveBuses).forEach(globalUnitId => {
          if (!currentActiveUnits.includes(globalUnitId)) {
            busesGroup.removeLayer(liveBuses[globalUnitId]);
            delete liveBuses[globalUnitId];
          }
        });

      } else {
        // Si borraste todos los camiones de monitoreo en Firebase
        busesGroup.clearLayers();
        Object.keys(liveBuses).forEach(key => delete liveBuses[key]);
      }
    });
  });

  let userLocationMarker = null;
  let userLocationCircle = null;

  function locateUser() {
    if (!map) return;
    // Pide la ubicación al navegador/celular y centra el mapa
    map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    
    map.once('locationfound', function(e) {
      const radius = e.accuracy / 2;

      if (!userLocationMarker) {
        userLocationMarker = L.marker(e.latlng).addTo(map)
          .bindPopup("Estás aquí (margen de error: " + Math.round(radius) + " metros)");
        userLocationCircle = L.circle(e.latlng, radius, {
          color: '#3b82f6',
          fillColor: '#3b82f6',
          fillOpacity: 0.15
        }).addTo(map);
      } else {
        userLocationMarker.setLatLng(e.latlng);
        userLocationCircle.setLatLng(e.latlng);
        userLocationCircle.setRadius(radius);
      }
      userLocationMarker.openPopup();
    });

    map.once('locationerror', function(e) {
      alert("No pudimos obtener tu ubicación. Asegúrate de darle permisos a tu navegador.");
    });
  }

  window.drawRouteTo = (startLat, startLng, destLat, destLng, origenName, destinoName) => {
    const userCoords = L.latLng(startLat, startLng);
    const destCoords = L.latLng(destLat, destLng);
    
    if (window.currentRouteLine) map.removeLayer(window.currentRouteLine);
    if (window.currentWalkingLine) map.removeLayer(window.currentWalkingLine);
    if (window.currentWalkingLine2) map.removeLayer(window.currentWalkingLine2);
    if (window.currentBusLine) map.removeLayer(window.currentBusLine);

    let startIsCampus = origenName && (origenName.toLowerCase().includes("edificio") || origenName.toLowerCase().includes("biblioteca") || origenName.toLowerCase().includes("rectoria") || origenName.toLowerCase().includes("puerta"));
    let destIsCampus = destinoName && (destinoName.toLowerCase().includes("edificio") || destinoName.toLowerCase().includes("biblioteca") || destinoName.toLowerCase().includes("rectoria") || destinoName.toLowerCase().includes("puerta"));

    // Buscar Paradas candidatas cercanas al inicio y al final (radio de 1200m)
    let startCandidates = [];
    let destCandidates = [];

    Object.entries(puntosInteres).forEach(([name, coords]) => {
      if (name.toLowerCase().includes("parada")) {
        const parsed = getCoords(coords);
        const stopCoords = L.latLng(parsed.lat, parsed.lng);
        
        const dStart = userCoords.distanceTo(stopCoords);
        if (dStart < 1200) {
          startCandidates.push({ name, coords: stopCoords, dist: dStart });
        }
        
        const dDest = destCoords.distanceTo(stopCoords);
        if (dDest < 1200) {
          destCandidates.push({ name, coords: stopCoords, dist: dDest });
        }
      }
    });

    startCandidates.sort((a, b) => a.dist - b.dist);
    destCandidates.sort((a, b) => a.dist - b.dist);

    const directDistance = userCoords.distanceTo(destCoords);

    // Si están muy cerca o ambos son de campus, caminar directo
    if (directDistance < 800 || (startIsCampus && destIsCampus)) {
      window.currentWalkingLine = L.polyline([userCoords, destCoords], {
        color: '#ec4899', weight: 5, dashArray: '10, 10', lineCap: 'round', lineJoin: 'round'
      }).addTo(map);
      map.fitBounds(window.currentWalkingLine.getBounds(), { padding: [50, 50] });
    } else {
      // Viaje largo: evaluar la mejor combinación de parada de origen y destino
      let bestRoute = null;
      let minTotalWalk = Infinity;

      const evaluateRouteArray = (stopsArray) => {
        if (!Array.isArray(stopsArray)) return;
        
        for (const startCand of startCandidates) {
          const idxStart = stopsArray.indexOf(startCand.name);
          if (idxStart === -1) continue;
          
          for (const destCand of destCandidates) {
            const idxEnd = stopsArray.indexOf(destCand.name);
            if (idxEnd !== -1 && idxStart < idxEnd) {
              const totalWalk = startCand.dist + destCand.dist;
              if (totalWalk < minTotalWalk) {
                minTotalWalk = totalWalk;
                bestRoute = {
                  startStop: startCand,
                  destStop: destCand,
                  stops: stopsArray.slice(idxStart, idxEnd + 1)
                };
              }
            }
          }
        }
      };

      for (const routeId in rutasData) {
        const routeObj = rutasData[routeId];
        if (Array.isArray(routeObj)) {
          evaluateRouteArray(routeObj);
        } else if (typeof routeObj === 'object') {
          for (const variant in routeObj) {
            evaluateRouteArray(routeObj[variant]);
          }
        }
      }

      let routeCoords = [];

      if (!bestRoute) {
        // Fallback si no hay conexión directa en ninguna ruta
        const fallbackStart = startCandidates[0] || { coords: userCoords, dist: 0 };
        const fallbackDest = destCandidates[0] || { coords: destCoords, dist: 0 };
        bestRoute = { startStop: fallbackStart, destStop: fallbackDest, stops: [] };
        routeCoords = [[fallbackStart.coords.lat, fallbackStart.coords.lng], [fallbackDest.coords.lat, fallbackDest.coords.lng]];
      } else {
        routeCoords = bestRoute.stops.map(s => {
          if (!s) return null;
          const parsed = getCoords(puntosInteres[s]);
          return [parsed.lat, parsed.lng];
        }).filter(c => c && !isNaN(c[0]));
      }

      if (bestRoute && bestRoute.startStop) {
        window.trackedStartStop = bestRoute.startStop.name;
        window.hasNotifiedStartStop = false;
        if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
          Notification.requestPermission();
        }
      }

      // Caminata inicial
      if (bestRoute.startStop.dist > 20) {
        window.currentWalkingLine = L.polyline([userCoords, bestRoute.startStop.coords], {
          color: '#94a3b8', weight: 4, dashArray: '8, 8', lineCap: 'round', lineJoin: 'round'
        }).addTo(map);
      }

      // Caminata final
      if (bestRoute.destStop.dist > 20) {
        window.currentWalkingLine2 = L.polyline([bestRoute.destStop.coords, destCoords], {
          color: '#94a3b8', weight: 4, dashArray: '8, 8', lineCap: 'round', lineJoin: 'round'
        }).addTo(map);
      }

      if (routeCoords.length > 95) {
        routeCoords = [[bestRoute.startStop.coords.lat, bestRoute.startStop.coords.lng], [bestRoute.destStop.coords.lat, bestRoute.destStop.coords.lng]];
      }

      const waypoints = routeCoords.map(c => `${c[1]},${c[0]}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;

      fetch(url)
        .then(res => res.json())
        .then(routeData => {
          let finalCoords = routeCoords;
          if (routeData.code === "Ok" && routeData.routes && routeData.routes.length > 0) {
            finalCoords = routeData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
          }
          window.currentBusLine = L.polyline(finalCoords, {
            color: '#3b82f6', weight: 5, lineCap: 'round', lineJoin: 'round'
          }).addTo(map);

          const group = new L.featureGroup([window.currentWalkingLine, window.currentWalkingLine2, window.currentBusLine].filter(Boolean));
          map.fitBounds(group.getBounds(), { padding: [50, 50] });
        })
        .catch(err => {
          console.error("Error obteniendo ruta de calles:", err);
          window.currentBusLine = L.polyline(routeCoords, {
            color: '#3b82f6', weight: 5, lineCap: 'round', lineJoin: 'round'
          }).addTo(map);
          const group = new L.featureGroup([window.currentWalkingLine, window.currentWalkingLine2, window.currentBusLine].filter(Boolean));
          map.fitBounds(group.getBounds(), { padding: [50, 50] });
        });
    }
    
    hasActiveRoute = true;
  };

  window.drawLiveBusRoute = (routeId, unitId) => {
    map.closePopup();
    const info = liveBusesData[routeId] && liveBusesData[routeId][unitId];
    if (!info || !info.siguiente_parada) {
      alert("No se puede trazar la ruta porque falta información de la siguiente parada del camión.");
      return;
    }

    const busLat = parseFloat(info.lat);
    const busLng = parseFloat(info.lng);
    if (isNaN(busLat) || isNaN(busLng)) return;

    let targetVariantStops = null;
    if (rutasData[routeId]) {
      if (Array.isArray(rutasData[routeId])) {
        targetVariantStops = rutasData[routeId];
      } else {
        const variante = getSentido(routeId, info);
        targetVariantStops = rutasData[routeId][variante];
      }
    }

    if (!targetVariantStops || !Array.isArray(targetVariantStops)) {
      alert("No se encontró el recorrido de esta ruta en la base de datos.");
      return;
    }

    const nextStopIndex = targetVariantStops.indexOf(info.siguiente_parada);
    if (nextStopIndex === -1) {
      alert("La siguiente parada no coincide con las registradas en el mapa.");
      return;
    }

    // Trazar desde el bus -> siguiente parada -> resto de las paradas
    const upcomingStops = targetVariantStops.slice(nextStopIndex);
    let routeCoords = [[busLat, busLng]];
    
    upcomingStops.forEach(stopName => {
      const coordsData = puntosInteresData[stopName];
      if (coordsData) {
        const parsed = getCoords(coordsData);
        if (!isNaN(parsed.lat)) routeCoords.push([parsed.lat, parsed.lng]);
      }
    });

    if (routeCoords.length < 2) return;

    if (window.currentRouteLine) map.removeLayer(window.currentRouteLine);
    if (window.currentWalkingLine) map.removeLayer(window.currentWalkingLine);
    if (window.currentWalkingLine2) map.removeLayer(window.currentWalkingLine2);
    if (window.currentBusLine) map.removeLayer(window.currentBusLine);

    // Limitar para OSRM
    const coordsToFetch = routeCoords.length > 95 ? [[busLat, busLng], routeCoords[routeCoords.length - 1]] : routeCoords;
    const waypoints = coordsToFetch.map(c => `${c[1]},${c[0]}`).join(';');
    const url = `https://router.project-osrm.org/route/v1/driving/${waypoints}?overview=full&geometries=geojson`;

    fetch(url)
      .then(res => res.json())
      .then(routeData => {
        let finalCoords = coordsToFetch;
        if (routeData.code === "Ok" && routeData.routes && routeData.routes.length > 0) {
          finalCoords = routeData.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        }
        window.currentBusLine = L.polyline(finalCoords, {
          color: '#f59e0b', weight: 6, lineCap: 'round', lineJoin: 'round', dashArray: '1, 10'
        }).addTo(map);
        map.fitBounds(window.currentBusLine.getBounds(), { padding: [50, 50] });
      })
      .catch(err => {
        console.error("Error OSRM:", err);
        window.currentBusLine = L.polyline(coordsToFetch, {
          color: '#f59e0b', weight: 6, lineCap: 'round', lineJoin: 'round', dashArray: '1, 10'
        }).addTo(map);
        map.fitBounds(window.currentBusLine.getBounds(), { padding: [50, 50] });
      });

    hasActiveRoute = true;
  };

  let puntosInteres = {};
  let searchQuery = '';
  let searchResults = [];
  
  // Route planner state
  let routeMode = false;
  let origenQuery = '';
  let destinoQuery = '';
  let activeSearchField = null;

  $: {
    let q = '';
    if (activeSearchField === 'origen') q = origenQuery;
    else if (activeSearchField === 'destino') q = destinoQuery;
    else q = searchQuery;

    if (q.trim().length > 0 && q !== "Mi ubicación actual") {
      const qLower = q.toLowerCase();
      searchResults = Object.keys(puntosInteres).filter(name => name.toLowerCase().includes(qLower));
    } else {
      searchResults = [];
    }
  }

  function handleSearchSelect(name) {
    if (routeMode) {
      if (activeSearchField === 'origen') {
        origenQuery = name;
      } else if (activeSearchField === 'destino') {
        destinoQuery = name;
      }
      activeSearchField = null;
      searchResults = [];
      calculateRoute(origenQuery, destinoQuery);
    } else {
      const coords = puntosInteres[name];
      if (coords && map) {
        const parsed = getCoords(coords);
        map.setView([parsed.lat, parsed.lng], 17);
        searchQuery = name;
        searchResults = [];
        
        setTimeout(() => {
          if (stopMarkers[name]) {
            stopMarkers[name].marker.openPopup();
          }
        }, 300);
      }
    }
  }

  function calculateRoute(origen, destino) {
    if (!origen || !destino) return;
    
    let startCoords;
    if (origen === "Mi ubicación actual") {
      if (!userLocationMarker) {
        alert("Primero necesitamos saber dónde estás. Da clic en el botón morado de ubicación 🎯 en la esquina inferior derecha.");
        return;
      }
      startCoords = userLocationMarker.getLatLng();
    } else {
      const coords = puntosInteres[origen];
      if (!coords) return;
      const parsed = getCoords(coords);
      startCoords = L.latLng(parsed.lat, parsed.lng);
    }

    const destData = puntosInteres[destino];
    if (!destData) return;
    const destParsed = getCoords(destData);
    const destCoords = L.latLng(destParsed.lat, destParsed.lng);

    window.drawRouteTo(startCoords.lat, startCoords.lng, destCoords.lat, destCoords.lng, origen, destino);
  }

  function exitRouteMode() {
    routeMode = false;
    origenQuery = '';
    destinoQuery = '';
    activeSearchField = null;
    clearRoute();
  }

  onDestroy(() => {
    if (map) {
      map.remove();
    }
  });
</script>

<div class="view-map">
  <!-- Top overlay bar -->
  <div class="map-header">
    <div class="header-left">
      <BusFront class="header-icon" size={24} />
      <h2>Mapa de Rutas</h2>
    </div>
    
    {#if !routeMode}
      <div class="search-container">
        <input 
          type="text" 
          placeholder="Buscar parada o edificio..." 
          bind:value={searchQuery} 
          on:focus={() => activeSearchField = 'search'}
          class="search-input" 
        />
        {#if searchResults.length > 0 && activeSearchField === 'search'}
          <ul class="search-results">
            {#each searchResults as result}
              <li><button on:click={() => handleSearchSelect(result)}>{result}</button></li>
            {/each}
          </ul>
        {/if}
      </div>
    {:else}
      <div class="route-planner-container">
        <button class="close-route-btn" on:click={exitRouteMode} title="Cerrar Rutas">
          <XCircle size={20} />
        </button>
        <div class="route-inputs">
          <div class="route-input-group">
            <span class="dot-origin"></span>
            <input 
              type="text" 
              placeholder="Origen..." 
              bind:value={origenQuery}
              on:focus={() => activeSearchField = 'origen'}
              class="search-input" 
            />
          </div>
          <div class="route-divider"></div>
          <div class="route-input-group">
            <span class="dot-dest"></span>
            <input 
              type="text" 
              placeholder="Destino..." 
              bind:value={destinoQuery}
              on:focus={() => activeSearchField = 'destino'}
              class="search-input" 
            />
            {#if destinoQuery && hasActiveRoute}
              <button class="search-confirm-btn" on:click={() => handleSearchSelect(destinoQuery)} title="Trazar ruta">
                <Search size={18} />
              </button>
            {/if}
          </div>
          {#if hasActiveRoute}
            <button class="safe-commute-btn {safeCommuteActive ? 'active' : ''}" on:click={toggleSafeCommute}>
              {#if safeCommuteActive}
                🛑 Cancelar
              {:else}
                🛡️ Viaje Seguro
              {/if}
            </button>
          {/if}
        </div>
        
        {#if searchResults.length > 0 || activeSearchField === 'origen'}
          <ul class="search-results route-results">
            {#if activeSearchField === 'origen'}
              <li><button class="my-loc-btn" on:click={() => { origenQuery = "Mi ubicación actual"; activeSearchField = null; searchResults = []; calculateRoute(origenQuery, destinoQuery); }}>📍 Usar mi ubicación actual</button></li>
            {/if}

            {#each searchResults as result}
              <li><button on:click={() => handleSearchSelect(result)}>{result}</button></li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}

    <button class="satellite-toggle" on:click={toggleSatellite} title="Cambiar Vista">
      {#if satelliteMode}
        <MapIcon size={18} strokeWidth={2.5} /> <span class="hide-mobile">Mapa</span>
      {:else}
        <ImageIcon size={18} strokeWidth={2.5} /> <span class="hide-mobile">Satélite</span>
      {/if}
    </button>
  </div>

  <!-- Leaflet map container -->
  <div class="map-container" bind:this={mapContainer}></div>

  <!-- Botón flotante para mi ubicación -->
  <button class="locate-btn" on:click={locateUser} title="Mi Ubicación">
    <Locate size={22} strokeWidth={2.5} />
  </button>

  {#if hasActiveRoute && !routeMode}
    <button class="clear-route-btn" on:click={clearRoute} title="Quitar Ruta">
      <XCircle size={22} strokeWidth={2.5} />
    </button>
  {/if}

  <!-- SOS Button -->
  <button class="sos-btn" on:click={triggerSOS} title="Botón de Pánico">SOS</button>

  {#if sosActive}
    <SOSModal {countdown} on:cancel={cancelSOS} />
  {/if}

  {#if safeCommuteFinished}
    <SafeCommuteAlert />
  {/if}

  {#if showIncidenciaModal}
    <IncidenciaModal 
      ubicacion={incidenciaUbicacion} 
      enviando={enviandoIncidencia}
      on:cancel={closeIncidenciaModal}
      on:submit={reportarIncidencia}
    />
  {/if}

  <MapLegend />
</div>

<style>
  .view-map {
    position: relative;
    width: 100%;
    height: 100vh;
    overflow: hidden;
    background: #0f1117;
  }

  /* ── Map fills entire view ── */
  .map-container {
    width: 100%;
    height: 100%;
    z-index: 0;
  }

  /* ── Glassmorphism header bar ── */
  .map-header {
    position: absolute;
    top: 16px;
    left: 16px;
    right: 16px;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 20px;
    background: rgba(15, 17, 23, 0.75);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(99, 102, 241, 0.2);
    border-radius: 14px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-icon {
    width: 24px;
    height: 24px;
    color: #6366f1;
    flex-shrink: 0;
  }

  .map-header h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
    letter-spacing: -0.3px;
    white-space: nowrap;
  }

  .search-container {
    position: relative;
    flex-grow: 1;
    max-width: 350px;
  }

  .search-input {
    width: 100%;
    background: rgba(15, 17, 23, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    padding: 10px 16px;
    color: white;
    font-size: 14px;
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.2s;
  }

  .search-input:focus {
    border-color: #6366f1;
  }

  .search-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 8px;
    margin-bottom: 0;
    padding: 8px 0;
    background: rgba(15, 17, 23, 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 12px;
    list-style: none;
    max-height: 250px;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  }

  .search-results li button {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: #cbd5e1;
    padding: 10px 16px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .search-results li button:hover {
    background: rgba(99, 102, 241, 0.2);
    color: white;
  }

  .my-loc-btn {
    color: #60a5fa !important;
    font-weight: 600;
  }

  /* ── Route Planner UI ── */
  .route-planner-container {
    position: relative;
    flex-grow: 1;
    max-width: 600px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(15, 17, 23, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 12px;
    padding: 8px 12px;
    box-shadow: inset 0 2px 10px rgba(0,0,0,0.2);
  }

  .route-inputs {
    flex-grow: 1;
    display: flex;
    flex-direction: row;
    gap: 8px;
    align-items: center;
  }

  .route-input-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-grow: 1;
  }

  .route-input-group .search-input {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid transparent;
    padding: 6px 12px;
    border-radius: 8px;
    width: 100%;
    min-width: 160px;
  }

  .confirm-route-btn {
    background: #6366f1;
    border: none;
    color: white;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.2s, transform 0.1s;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
  }

  .confirm-route-btn:hover {
    background: #4f46e5;
  }

  .confirm-route-btn:active {
    transform: scale(0.95);
  }
  
  .route-input-group .search-input:focus {
    border-color: rgba(99, 102, 241, 0.5);
    background: rgba(0, 0, 0, 0.4);
  }

  .dot-origin {
    width: 10px; height: 10px; border-radius: 50%;
    border: 2px solid #60a5fa; background: transparent;
    flex-shrink: 0;
  }

  .dot-dest {
    width: 10px; height: 10px; border-radius: 50%;
    background: #f43f5e;
    flex-shrink: 0;
  }

  .route-divider {
    width: 1px;
    height: 24px;
    background: rgba(255, 255, 255, 0.1);
    margin: 0 4px;
  }

  .close-route-btn {
    background: none; border: none; color: #94a3b8;
    cursor: pointer; padding: 4px; display: flex;
    align-items: center; justify-content: center;
    border-radius: 50%; transition: all 0.2s;
  }
  
  .close-route-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .route-results {
    top: calc(100% + 8px);
    left: 0; right: 0;
  }

  /* ── Satellite Toggle Button ── */
  .satellite-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
    background: rgba(15, 17, 23, 0.8);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 10px 16px;
    color: white;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
    transition: all 0.2s;
  }

  .satellite-toggle:hover {
    background: rgba(99, 102, 241, 0.2);
    border-color: #6366f1;
  }

  /* ── Legend overlay ── */
  .map-legend {
    position: absolute;
    bottom: 28px;
    left: 16px;
    z-index: 1000;
    padding: 14px 18px;
    background: rgba(15, 17, 23, 0.75);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 12px;
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  }

  /* ── Locate Button ── */
  .locate-btn {
    position: absolute;
    bottom: 30px;  /* A la misma altura que los controles de zoom */
    right: 70px;   /* A la izquierda de los controles de zoom */
    z-index: 1000;
    width: 46px;
    height: 46px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: white;
    border: none;
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .locate-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(99, 102, 241, 0.6);
  }

  .clear-route-btn {
    position: absolute;
    bottom: 110px;
    right: 20px;
    z-index: 1000;
    width: 46px;
    height: 46px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #f43f5e, #e11d48);
    color: white;
    border: none;
    border-radius: 50%;
    box-shadow: 0 4px 16px rgba(225, 29, 72, 0.4);
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .clear-route-btn:hover {
    transform: scale(1.05);
    box-shadow: 0 6px 20px rgba(225, 29, 72, 0.6);
  }

  /* ── SOS & Safe Commute Styles ── */
  .sos-btn {
    position: absolute;
    bottom: 160px;
    left: 20px;
    z-index: 1000;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    color: white;
    font-weight: 800;
    font-size: 18px;
    border: 2px solid #fca5a5;
    box-shadow: 0 0 16px rgba(239, 68, 68, 0.6), inset 0 0 8px rgba(0,0,0,0.2);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.1s;
    animation: pulse-sos 2s infinite;
  }

  .sos-btn:active {
    transform: scale(0.9);
  }

  @keyframes pulse-sos {
    0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
    70% { box-shadow: 0 0 0 15px rgba(239, 68, 68, 0); }
    100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }

  /* ── Custom bus markers ── */
  :global(.bus-marker) {
    background: none !important;
    border: none !important;
  }

  :global(.bus-marker-inner svg) {
    color: white;
    filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
  }

  /* Animación suave para el movimiento de los camiones */
  :global(.animated-bus) {
    transition: transform 0.8s linear !important;
  }

  :global(.bus-marker-inner) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: linear-gradient(135deg, #6366f1, #22d3ee);
    border-radius: 50%;
    color: #fff;
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: transform 0.2s;
  }

  :global(.bus-marker-inner:hover) {
    transform: scale(1.15);
  }

  /* ── Popup styling ── */
  :global(.leaflet-popup-content-wrapper) {
    background: rgba(15, 17, 23, 0.9) !important;
    backdrop-filter: blur(12px);
    border: 1px solid rgba(99, 102, 241, 0.25) !important;
    border-radius: 10px !important;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4) !important;
    color: #e2e8f0 !important;
  }

  :global(.leaflet-popup-tip) {
    background: rgba(15, 17, 23, 0.9) !important;
  }

  :global(.popup-content) {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: inherit;
    min-width: 200px;
  }

  :global(.popup-content strong) {
    font-size: 14px;
    color: #f1f5f9;
  }

  :global(.popup-line) {
    font-size: 12px;
    color: #6366f1;
    font-weight: 500;
  }

  :global(.leaflet-popup-close-button) {
    color: #64748b !important;
  }

  :global(.leaflet-popup-close-button:hover) {
    color: #e2e8f0 !important;
  }

  /* ── Zoom controls ── */
  :global(.leaflet-control-zoom) {
    border: none !important;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3) !important;
    border-radius: 10px !important;
    overflow: hidden;
  }

  :global(.leaflet-control-zoom a) {
    background: rgba(15, 17, 23, 0.8) !important;
    backdrop-filter: blur(12px);
    color: #e2e8f0 !important;
    border: none !important;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
    width: 36px !important;
    height: 36px !important;
    line-height: 36px !important;
    font-size: 18px !important;
    transition: background 0.2s;
  }

  :global(.leaflet-control-zoom a:hover) {
    background: rgba(99, 102, 241, 0.3) !important;
  }

  :global(.leaflet-control-zoom a:last-child) {
    border-bottom: none !important;
  }

  /* ── Attribution ── */
  :global(.leaflet-control-attribution) {
    background: rgba(15, 17, 23, 0.6) !important;
    color: #475569 !important;
    font-size: 10px !important;
    backdrop-filter: blur(8px);
  }

  :global(.leaflet-control-attribution a) {
    color: #6366f1 !important;
  }

  /* ── Responsive ── */
  @media (max-width: 640px) {
    .map-header {
      flex-wrap: wrap;
      gap: 10px;
      top: 10px;
      left: 10px;
      right: 10px;
      padding: 10px;
    }

    .header-left h2 {
      display: none; /* Hide title on small screens to fit search bar */
    }

    .search-container {
      order: 3;
      min-width: 100%;
    }

    .hide-mobile {
      display: none;
    }

    .satellite-toggle {
      padding: 10px;
    }

    .map-legend {
      display: none; /* Ocultar leyenda en móviles para ahorrar espacio */
    }

    .route-planner-container {
      flex-direction: column;
      align-items: stretch;
      padding: 12px;
    }

    .route-inputs {
      flex-direction: column;
      gap: 12px;
      align-items: stretch;
    }

    .route-divider {
      height: 1px;
      width: 100%;
      margin: 2px 0;
    }

    .route-input-group .search-input {
      min-width: unset;
    }

    .close-route-btn {
      position: absolute;
      top: 8px;
      right: 8px;
    }

    .safe-commute-btn {
      width: 100%;
    }

    .sos-btn {
      width: 48px;
      height: 48px;
      bottom: 20px;
      left: 10px;
      font-size: 14px;
    }

    .locate-btn {
      width: 40px;
      height: 40px;
      bottom: 24px;
      right: 60px;
    }
  }
</style>
