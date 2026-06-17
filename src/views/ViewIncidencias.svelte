<script>
  import { onMount } from 'svelte';
  import { db } from '../lib/firebase.js';
  import { ref, onValue } from 'firebase/database';

  let incidencias = [];
  let selectedDate = ''; // Empty means show all

  // Computed variable to filter by date
  $: incidenciasFiltradas = incidencias.filter(incidencia => {
    if (!selectedDate) return true;
    const incidenciaDate = new Date(incidencia.fecha).toISOString().split('T')[0];
    return incidenciaDate === selectedDate;
  });

  onMount(() => {
    const incidenciasRef = ref(db, 'incidencias');
    const unsubscribe = onValue(incidenciasRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        incidencias = Object.entries(data).map(([id, info]) => ({
          id,
          ...info
        })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
      } else {
        incidencias = [];
      }
    });

    return () => unsubscribe();
  });
</script>

<div class="incidencias-container">
  <div class="header-section">
    <h2>Registro de Incidencias</h2>
    <div class="filter-section">
      <label for="date-filter">Filtrar por fecha:</label>
      <input type="date" id="date-filter" bind:value={selectedDate} />
      {#if selectedDate}
        <button class="btn-clear" on:click={() => selectedDate = ''}>Ver todas</button>
      {/if}
    </div>
  </div>

  {#if incidenciasFiltradas.length === 0}
    <p>No hay incidencias reportadas aún.</p>
  {:else}
    <div class="incidencias-list">
      {#each incidenciasFiltradas as incidencia}
        <div class="incidencia-card">
          <div class="header">
            <span class="tipo {incidencia.tipo === 'Saturación' ? 'saturacion' : 'retraso'}">
              {incidencia.tipo}
            </span>
            <span class="fecha">{new Date(incidencia.fecha).toLocaleString()}</span>
          </div>
          <div class="detalles">
            <p><strong>Ruta/Parada:</strong> {incidencia.ubicacion || 'No especificada'}</p>
            <p><strong>Descripción:</strong> {incidencia.descripcion}</p>
            {#if incidencia.usuario}
              <p class="usuario">Reportado por: {incidencia.usuario}</p>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .incidencias-container {
    padding: 24px;
    height: 100%;
    overflow-y: auto;
  }
  
  h2 {
    color: #f8fafc;
    margin: 0;
    font-size: 24px;
  }

  .header-section {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 24px;
  }

  .filter-section {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .filter-section label {
    color: #94a3b8;
    font-size: 14px;
  }

  .filter-section input[type="date"] {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    padding: 8px 12px;
    border-radius: 8px;
    font-family: inherit;
    color-scheme: dark;
  }

  .filter-section input[type="date"]:focus {
    outline: none;
    border-color: #6366f1;
  }

  .btn-clear {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: none;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }

  .btn-clear:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .incidencias-list {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .incidencia-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    padding: 16px;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .tipo {
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 14px;
    font-weight: 600;
    color: white;
  }

  .tipo.saturacion {
    background: #ef4444; /* Red */
  }

  .tipo.retraso {
    background: #f59e0b; /* Amber */
  }

  .fecha {
    font-size: 14px;
    color: #94a3b8;
  }

  .detalles p {
    margin: 4px 0;
    font-size: 15px;
    color: #cbd5e1;
  }

  .usuario {
    margin-top: 8px !important;
    font-size: 13px !important;
    color: #64748b !important;
  }
</style>
