<script>
  import { onMount, createEventDispatcher, onDestroy } from 'svelte';
  import { auth, db } from '../lib/firebase.js';
  import { ref, get, set, remove, onValue } from 'firebase/database';
  import { onAuthStateChanged } from 'firebase/auth';
  import { Map, ChevronRight, ChevronLeft } from 'lucide-svelte';

  const dispatch = createEventDispatcher();
  let rutasData = {};
  let puntosInteres = {};
  let loading = true;
  let activeSentido = {};
  let selectedRouteDetail = null;

  $: {
    if (rutasData) {
      Object.entries(rutasData).forEach(([rutaName, rutaInfo]) => {
        if (!Array.isArray(rutaInfo) && typeof rutaInfo === 'object' && rutaInfo !== null && !rutaInfo.paradas) {
          if (!activeSentido[rutaName]) {
            activeSentido[rutaName] = Object.keys(rutaInfo)[0];
          }
        }
      });
    }
  }
  
  let currentUser = null;
  let favorites = {};
  let authUnsubscribe;
  let favsUnsubscribe;

  onMount(async () => {
    authUnsubscribe = onAuthStateChanged(auth, (user) => {
      currentUser = user;
      if (user) {
        const favsRef = ref(db, `usuarios/${user.uid}/favoritos`);
        favsUnsubscribe = onValue(favsRef, (snapshot) => {
          favorites = snapshot.exists() ? snapshot.val() : {};
        });
      } else {
        favorites = {};
        if (favsUnsubscribe) favsUnsubscribe();
      }
    });

    try {
      // Fetch points of interest to get coordinates
      const puntosSnapshot = await get(ref(db, 'puntos_interes'));
      if (puntosSnapshot.exists()) {
        puntosInteres = puntosSnapshot.val();
      }

      // Fetch routes
      const rutasSnapshot = await get(ref(db, 'rutas'));
      if (rutasSnapshot.exists()) {
        rutasData = rutasSnapshot.val();
      }
    } catch (error) {
      console.error("Error loading routes:", error);
    } finally {
      loading = false;
    }
  });

  onDestroy(() => {
    if (authUnsubscribe) authUnsubscribe();
    if (favsUnsubscribe) favsUnsubscribe();
  });

  function handleStopClick(stopName) {
    const coords = puntosInteres[stopName];
    let lat, lng;
    if (typeof coords === 'string') {
      const parts = coords.split(',');
      lat = parseFloat(parts[0].trim());
      lng = parseFloat(parts[1].trim());
    } else if (coords && coords.lat !== undefined) {
      lat = parseFloat(coords.lat);
      lng = parseFloat(coords.lng);
    }
    
    if (lat !== undefined && !isNaN(lat) && !isNaN(lng)) {
      dispatch('stopSelected', {
        lat,
        lng,
        name: stopName
      });
    } else {
      alert("No se encontraron coordenadas para esta parada.");
    }
  }

  function handleRouteClick(rutaName, rutaInfo) {
    let paradas;
    let displayName = rutaName;

    if (Array.isArray(rutaInfo)) {
      paradas = rutaInfo;
    } else if (rutaInfo.paradas) {
      paradas = rutaInfo.paradas;
    } else {
      const sentido = activeSentido[rutaName];
      paradas = rutaInfo[sentido];
      displayName = `${rutaName} - ${sentido}`;
    }

    if (Array.isArray(paradas)) {
      dispatch('routeSelected', {
        name: displayName,
        paradas: paradas.filter(Boolean)
      });
    } else {
      alert("No hay ruta configurada.");
    }
  }

  function toggleFavorite(rutaName) {
    if (!currentUser) {
      alert("Necesitas iniciar sesión para guardar favoritos.");
      return;
    }
    
    const favRef = ref(db, `usuarios/${currentUser.uid}/favoritos/${rutaName}`);
    if (favorites[rutaName]) {
      remove(favRef);
    } else {
      set(favRef, true);
    }
  }
</script>

<div class="rutas-container">
  <div class="header">
    <h2>Directorio de Rutas</h2>
    <p>Selecciona una parada para ubicarla en el mapa</p>
  </div>

  {#if loading}
    <div class="loading-state">Cargando rutas...</div>
  {:else if selectedRouteDetail}
    <!-- Detail View -->
    <div class="route-detail-view">
      <button class="back-btn" on:click={() => selectedRouteDetail = null}>
        <ChevronLeft size={20} /> Volver al Directorio
      </button>

      <div class="ruta-card detail-card">
        <div class="ruta-header">
          <div class="ruta-badge">{selectedRouteDetail.name}</div>
          <h3>Ruta {selectedRouteDetail.name}</h3>
          <div style="flex-grow: 1;"></div>
          <button class="view-route-btn" on:click={() => handleRouteClick(selectedRouteDetail.name, selectedRouteDetail.info)} title="Ver ruta completa en el mapa">
            <Map size={20} strokeWidth={2} />
          </button>
          <button class="fav-btn" class:is-fav={favorites[selectedRouteDetail.name]} on:click={() => toggleFavorite(selectedRouteDetail.name)} title="Guardar en favoritos">
            <svg viewBox="0 0 24 24" width="20" height="20" fill={favorites[selectedRouteDetail.name] ? "currentColor" : "none"} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>
        
        <div class="ruta-body">
          {#if !Array.isArray(selectedRouteDetail.info) && typeof selectedRouteDetail.info === 'object' && selectedRouteDetail.info !== null && !selectedRouteDetail.info.paradas}
            <div class="sentidos-toggle">
              {#each Object.keys(selectedRouteDetail.info) as sentido}
                <button 
                  class="sentido-btn" 
                  class:active={activeSentido[selectedRouteDetail.name] === sentido}
                  on:click={() => activeSentido[selectedRouteDetail.name] = sentido}
                >
                  {sentido}
                </button>
              {/each}
            </div>
            <ul class="stops-list">
              {#each (selectedRouteDetail.info[activeSentido[selectedRouteDetail.name]] || []).filter(Boolean) as parada}
                <li>
                  <button class="stop-btn" on:click={() => handleStopClick(parada)}>
                    <div class="stop-icon">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <span>{parada}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else if selectedRouteDetail.info.paradas && Array.isArray(selectedRouteDetail.info.paradas)}
            <ul class="stops-list">
              {#each selectedRouteDetail.info.paradas.filter(Boolean) as parada}
                <li>
                  <button class="stop-btn" on:click={() => handleStopClick(parada)}>
                    <div class="stop-icon">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <span>{parada}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else if Array.isArray(selectedRouteDetail.info)}
            <ul class="stops-list">
              {#each selectedRouteDetail.info.filter(Boolean) as parada}
                <li>
                  <button class="stop-btn" on:click={() => handleStopClick(parada)}>
                    <div class="stop-icon">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                    </div>
                    <span>{parada}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {:else}
            <div class="empty-state">No hay paradas configuradas para esta ruta.</div>
          {/if}
        </div>
      </div>
    </div>
  {:else}
    <!-- Grid View -->
    <div class="rutas-grid">
      {#each Object.entries(rutasData) as [rutaName, rutaInfo]}
        <div class="ruta-card grid-card" on:click={() => selectedRouteDetail = { name: rutaName, info: rutaInfo }}>
          <div class="ruta-header">
            <div class="ruta-badge">{rutaName}</div>
            <h3>Ruta {rutaName}</h3>
            <div style="flex-grow: 1;"></div>
            <div class="chevron-icon">
              <ChevronRight size={20} />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .rutas-container {
    padding: 32px;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
    background: radial-gradient(circle at top right, rgba(99, 102, 241, 0.05), transparent 40%), #0f1117;
  }

  .header {
    margin-bottom: 32px;
  }

  .header h2 {
    font-size: 28px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 8px 0;
    letter-spacing: -0.5px;
  }

  .header p {
    color: #94a3b8;
    margin: 0;
    font-size: 15px;
  }

  .loading-state {
    color: #6366f1;
    font-size: 16px;
    text-align: center;
    padding: 40px;
  }

  .rutas-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
    gap: 24px;
  }

  .ruta-card {
    background: rgba(30, 41, 59, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.05);
    border-radius: 20px;
    overflow: hidden;
    transition: transform 0.2s, box-shadow 0.2s;
  }

  .ruta-card:hover {
    transform: translateY(-4px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
    border-color: rgba(99, 102, 241, 0.3);
  }

  .ruta-header {
    padding: 20px 24px;
    background: rgba(99, 102, 241, 0.1);
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid transparent;
  }

  .grid-card {
    cursor: pointer;
  }

  .grid-card .ruta-header:hover {
    background: rgba(99, 102, 241, 0.15);
  }

  .detail-card .ruta-header {
    border-bottom-color: rgba(255, 255, 255, 0.05);
  }

  .chevron-icon {
    color: #64748b;
    display: flex;
    align-items: center;
    transition: transform 0.3s ease;
  }

  .grid-card:hover .chevron-icon {
    color: #8b5cf6;
    transform: translateX(4px);
  }

  .back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    padding: 0;
    margin-bottom: 24px;
    transition: color 0.2s;
  }

  .back-btn:hover {
    color: #f1f5f9;
  }

  .ruta-badge {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: white;
    font-weight: 700;
    font-size: 14px;
    padding: 6px 12px;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }

  .ruta-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .view-route-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .view-route-btn:hover {
    color: #8b5cf6;
    background: rgba(139, 92, 246, 0.1);
  }

  .fav-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 8px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .fav-btn:hover {
    color: #f43f5e;
    background: rgba(244, 63, 94, 0.1);
  }

  .fav-btn.is-fav {
    color: #f43f5e;
  }

  .ruta-body {
    padding: 20px 24px;
  }

  /* ── Sentidos Toggle ── */
  .sentidos-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 16px;
    padding: 4px;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    overflow-x: auto;
  }

  .sentidos-toggle::-webkit-scrollbar {
    height: 4px;
  }

  .sentidos-toggle::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.1);
    border-radius: 4px;
  }

  .sentido-btn {
    flex: 1;
    min-width: fit-content;
    padding: 8px 12px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 13px;
    font-weight: 500;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .sentido-btn:hover {
    color: white;
  }

  .sentido-btn.active {
    background: #6366f1;
    color: white;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.4);
  }

  .stops-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stop-btn {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    background: transparent;
    border: none;
    color: #cbd5e1;
    font-size: 14px;
    text-align: left;
    padding: 10px 12px;
    border-radius: 10px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .stop-btn:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #22d3ee;
  }

  .stop-icon {
    color: #6366f1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-state {
    color: #64748b;
    font-size: 14px;
    font-style: italic;
  }
</style>
