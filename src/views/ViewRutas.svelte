<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import { db } from '../lib/firebase.js';
  import { ref, get } from 'firebase/database';

  const dispatch = createEventDispatcher();
  let rutasData = {};
  let puntosInteres = {};
  let loading = true;

  onMount(async () => {
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

  function handleStopClick(stopName) {
    const coords = puntosInteres[stopName];
    if (coords && coords.lat && coords.lng) {
      dispatch('stopSelected', {
        lat: parseFloat(coords.lat),
        lng: parseFloat(coords.lng),
        name: stopName
      });
    } else {
      alert("No se encontraron coordenadas para esta parada.");
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
  {:else}
    <div class="rutas-grid">
      {#each Object.entries(rutasData) as [rutaName, rutaInfo]}
        <div class="ruta-card">
          <div class="ruta-header">
            <div class="ruta-badge">{rutaName}</div>
            <h3>Ruta {rutaName}</h3>
          </div>
          <div class="ruta-body">
            {#if rutaInfo.paradas && Array.isArray(rutaInfo.paradas)}
              <ul class="stops-list">
                {#each rutaInfo.paradas as parada}
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
            {:else if Array.isArray(rutaInfo)}
              <ul class="stops-list">
                {#each rutaInfo as parada}
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
    gap: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
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

  .ruta-body {
    padding: 20px 24px;
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
