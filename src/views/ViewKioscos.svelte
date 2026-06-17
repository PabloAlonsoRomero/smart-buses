<script>
  import { onMount, onDestroy } from 'svelte';
  import { db } from '../lib/firebase.js';
  import { ref, onValue } from 'firebase/database';
  
  let map;
  let busesGroup;
  let liveBuses = [];
  let unsubscribe;
  
  onMount(async () => {
    // Only import leaflet on client side
    const L = await import('leaflet');
    
    // Configurar mapa de Leaflet
    map = L.map('kiosco-map', {
      zoomControl: false // Ocultar control de zoom para kioscos
    }).setView([21.1520, -101.7115], 14); // Campus La Salle por defecto

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    busesGroup = L.layerGroup().addTo(map);

    const svgBus = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6 2 7"/><path d="M10 6h4"/><path d="m22 7-2-1"/><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M8 15h.01"/><path d="M16 15h.01"/><path d="M6 19v2"/><path d="M18 19v2"/></svg>`;
    const iconLiveBus = L.divIcon({
      className: 'bus-marker animated-bus',
      html: `<div class="bus-marker-inner" style="background: linear-gradient(135deg, #f59e0b, #d97706); box-shadow: 0 0 12px #f59e0b80, 0 2px 8px rgba(0, 0, 0, 0.3);">
               ${svgBus}
             </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });

    const monitoreoRef = ref(db, 'monitoreo');
    unsubscribe = onValue(monitoreoRef, (snapshot) => {
      const data = snapshot.val();
      const busesList = [];
      busesGroup.clearLayers();

      if (data) {
        Object.entries(data).forEach(([routeId, busesData]) => {
          Object.entries(busesData).forEach(([unitId, info]) => {
            const lat = parseFloat(info.lat);
            const lng = parseFloat(info.lng);
            
            busesList.push({
              ruta: routeId,
              unidad: unitId,
              estado: info.estado || 'En ruta',
              eta: info.tiempo_estimado_min || '?',
              parada: info.siguiente_parada || 'Desconocida',
              lat, lng
            });

            if (!isNaN(lat) && !isNaN(lng)) {
               L.marker([lat, lng], { icon: iconLiveBus }).addTo(busesGroup);
            }
          });
        });
      }
      
      // Ordenar por ETA (los más próximos primero)
      liveBuses = busesList.sort((a, b) => {
        const etaA = isNaN(parseInt(a.eta)) ? 999 : parseInt(a.eta);
        const etaB = isNaN(parseInt(b.eta)) ? 999 : parseInt(b.eta);
        return etaA - etaB;
      });
    });

    return () => {
      if (unsubscribe) unsubscribe();
      if (map) {
        map.remove();
      }
    };
  });
</script>

<div class="kiosco-layout">
  <div class="info-panel">
    <div class="kiosco-header">
      <h2>Smart Buses Kiosco</h2>
      <p>Información en tiempo real</p>
    </div>
    
    <div class="status-board">
      {#if liveBuses.length === 0}
        <div class="status-empty">
          No hay unidades activas en este momento.
        </div>
      {:else}
        {#each liveBuses as bus}
          <div class="status-item {bus.estado === 'Llegando a paradero' ? 'delayed' : ''}">
            <span class="route">Ruta {bus.ruta} ({bus.unidad})</span>
            <span class="parada">Próxima: {bus.parada}</span>
            <span class="time">
              {bus.estado === 'Llegando a paradero' ? '¡Llegando!' : `ETA: ${bus.eta} min`}
            </span>
          </div>
        {/each}
      {/if}
    </div>
    
    <div class="kiosco-footer">
      <p>Escanea el QR en tu paradero para ver esta información en tu celular.</p>
    </div>
  </div>
  
  <div class="map-container">
    <div id="kiosco-map"></div>
  </div>
</div>

<style>
  .kiosco-layout {
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background: #0f1117;
  }

  .info-panel {
    width: 400px;
    background: rgba(15, 17, 23, 0.95);
    border-right: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  .kiosco-header {
    padding: 32px 24px;
    background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), transparent);
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .kiosco-header h2 {
    margin: 0 0 8px;
    font-size: 28px;
    color: #fff;
  }

  .kiosco-header p {
    margin: 0;
    color: #94a3b8;
    font-size: 16px;
  }

  .status-board {
    flex: 1;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    overflow-y: auto;
  }

  .status-item {
    background: rgba(255, 255, 255, 0.05);
    padding: 20px;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-left: 4px solid #10b981;
  }

  .status-item.delayed {
    border-left-color: #ef4444;
  }

  .status-item .route {
    font-size: 18px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .status-item .time {
    font-size: 15px;
    color: #94a3b8;
  }

  .status-item.delayed .time {
    color: #ef4444;
  }

  .status-item .parada {
    font-size: 13px;
    color: #cbd5e1;
  }

  .kiosco-footer {
    padding: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
    text-align: center;
    color: #64748b;
    font-size: 14px;
  }

  .map-container {
    flex: 1;
    position: relative;
  }

  #kiosco-map {
    width: 100%;
    height: 100%;
  }

  :global(.leaflet-container) {
    background: #0f1117 !important;
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

  :global(.animated-bus) {
    transition: transform 0.8s linear !important;
  }
</style>
