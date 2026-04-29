<script>
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { db } from '../lib/firebase.js';
  import { ref, onValue } from 'firebase/database';

  export let initialFocusLocation = null;

  let mapContainer;
  let map;

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
    }).setView([20.6597, -103.3496], 13); // Guadalajara, MX as default

    // Dark-themed tile layer for a modern look
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    // Custom zoom control in bottom-right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // Function to create custom colored icons
    const createIcon = (color1, color2, svgHtml) => L.divIcon({
      className: 'bus-marker',
      html: `<div class="bus-marker-inner" style="background: linear-gradient(135deg, ${color1}, ${color2}); box-shadow: 0 0 12px ${color1}80, 0 2px 8px rgba(0, 0, 0, 0.3);">
               ${svgHtml}
             </div>`,
      iconSize: [36, 36],
      iconAnchor: [18, 18],
    });

    const svgBus = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M8 6v6"/><path d="M16 6v6"/>
                      <rect x="4" y="2" width="16" height="16" rx="3"/>
                      <path d="M4 11h16"/><path d="M8 18v2"/><path d="M16 18v2"/>
                      <circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>
                    </svg>`;

    const svgGate = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                       <path d="M18 20V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16"/>
                       <path d="M2 20h20"/>
                       <circle cx="14" cy="12" r="1.5" fill="currentColor" stroke="none" />
                     </svg>`;

    const iconPuerta = createIcon('#ec4899', '#f43f5e', svgGate); // Rosa/Rojo
    const iconParada = createIcon('#22d3ee', '#3b82f6', svgBus); // Cyan/Azul
    const iconDefault = createIcon('#6366f1', '#a855f7', svgBus); // Indigo/Morado

    // Layer group for dynamic markers
    const markersGroup = L.layerGroup().addTo(map);

    // Read "puntos_interes" from Firebase Realtime Database
    const puntosRef = ref(db, 'puntos_interes');
    let stopMarkers = {}; // NEW: Keep track of stop markers to update their popups later

    onValue(puntosRef, (snapshot) => {
      markersGroup.clearLayers();
      for (const key in stopMarkers) delete stopMarkers[key];
      const data = snapshot.val();
      if (data) {
        Object.entries(data).forEach(([name, coords]) => {
          const lat = parseFloat(coords.lat);
          const lng = parseFloat(coords.lng);
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
        if (initialFocusLocation) {
          map.setView([initialFocusLocation.lat, initialFocusLocation.lng], 18);
          // Intentar abrir el popup si encontramos la parada seleccionada
          if (stopMarkers[initialFocusLocation.name]) {
            setTimeout(() => {
              stopMarkers[initialFocusLocation.name].marker.openPopup();
            }, 500); // Pequeño retraso para que cargue el mapa y termine el render
          }
        } else if (keys.length > 0) {
          const firstPoint = data[keys[0]];
          map.setView([parseFloat(firstPoint.lat), parseFloat(firstPoint.lng)], 15);
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
      iconSize: [36, 36],
      iconAnchor: [18, 18],
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
                    <span class="popup-line">Próxima parada: ${info.siguiente_parada || 'Desconocido'}</span>
                  </div>
                `;
              
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

        // 1. Update stop popups with ETA information SOLO para Paradas de Autobús
        Object.keys(stopMarkers).forEach(stopName => {
          const stop = stopMarkers[stopName];
          
          // Ignorar puertas y puntos de interés generales
          if (stop.currentType !== "Parada de Autobús") {
            return; // Saltamos a la siguiente
          }

          let proximos = [];
          
          // Revisamos todos los camiones y leemos el cálculo exacto que hizo el simulador
          Object.entries(data).forEach(([routeId, busesData]) => {
            Object.entries(busesData).forEach(([unitId, info]) => {
              // Verificamos si el backend nos mandó el diccionario "etas_completos"
              if (info.etas_completos && info.etas_completos[stopName]) {
                const etaInfo = info.etas_completos[stopName];
                proximos.push({
                  ruta: routeId,
                  minutos: etaInfo.minutos,
                  estado: etaInfo.estado
                });
              }
            });
          });
          
          let etaHtml = `<div style="margin-top: 8px; font-size: 13px; color: #94a3b8;">Esperando información de rutas...</div>`;
          
          if (proximos.length > 0) {
            proximos.sort((a, b) => a.minutos - b.minutos); // Sort from closest to farthest
            
            etaHtml = `<div style="margin-top: 8px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 8px;">`;
            proximos.forEach(p => {
              const color = p.estado === 'Llegando a paradero' ? '#ef4444' : '#22c55e';
              const timeText = p.estado === 'Llegando a paradero' ? '¡Llegando!' : p.minutos + ' min aprox';
              
              etaHtml += `
                <div style="margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #6366f1;">Ruta ${p.ruta}</strong> 
                  <span style="color: ${color}; font-weight: 600; font-size: 13px;">
                    ${timeText}
                  </span>
                </div>
              `;
            });
            etaHtml += `</div>`;
          }

          stop.marker.setPopupContent(`
            <div class="popup-content">
              <strong>${stopName}</strong>
              <span class="popup-line">${stop.currentType}</span>
              ${etaHtml}
            </div>
          `);
        });

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
      <svg class="header-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M8 6v6"/><path d="M16 6v6"/>
        <rect x="4" y="2" width="16" height="16" rx="3"/>
        <path d="M4 11h16"/><path d="M8 18v2"/><path d="M16 18v2"/>
        <circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>
      </svg>
      <h2>Mapa de Rutas</h2>
    </div>
  </div>

  <!-- Leaflet map container -->
  <div class="map-container" bind:this={mapContainer}></div>

  <!-- Legend overlay -->
  <div class="map-legend">
    <h4>Leyenda</h4>
    <div class="legend-item">
      <span class="legend-dot" style="background: linear-gradient(135deg, #ec4899, #f43f5e);"></span>
      <span>Puerta / Acceso</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: linear-gradient(135deg, #22d3ee, #3b82f6);"></span>
      <span>Parada de autobús</span>
    </div>
    <div class="legend-item">
      <span class="legend-dot" style="background: linear-gradient(135deg, #6366f1, #a855f7);"></span>
      <span>Otro punto</span>
    </div>
  </div>
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
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  }

  .map-legend h4 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #cbd5e1;
  }

  .legend-item + .legend-item {
    margin-top: 6px;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px currentColor;
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
      flex-direction: column;
      align-items: stretch;
      gap: 10px;
      top: 10px;
      left: 10px;
      right: 10px;
      padding: 10px 14px;
    }

    .map-header h2 {
      font-size: 16px;
    }

    .map-legend {
      bottom: 18px;
      left: 10px;
    }
  }
</style>
