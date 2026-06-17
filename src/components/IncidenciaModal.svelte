<script>
  import { createEventDispatcher } from 'svelte';
  
  export let ubicacion = '';
  export let enviando = false;
  
  let tipo = 'Retraso';
  let descripcion = '';

  const dispatch = createEventDispatcher();

  function handleSubmit() {
    dispatch('submit', { tipo, descripcion });
  }
</script>

<div class="sos-modal-overlay">
  <div class="sos-modal incidencia-modal">
    <h2 style="color: #f59e0b;">Reportar Incidencia</h2>
    <p>Ayuda a la comunidad reportando unidades saturadas o retrasos.</p>
    
    <div class="form-group">
      <label>Tipo de Incidencia</label>
      <select bind:value={tipo}>
        <option>Retraso</option>
        <option>Saturación</option>
      </select>
    </div>

    <div class="form-group">
      <label>Parada Afectada</label>
      <input type="text" value={ubicacion} readonly style="background: rgba(255,255,255,0.02); color: #cbd5e1; cursor: not-allowed;" />
    </div>

    <div class="form-group">
      <label>Descripción</label>
      <textarea bind:value={descripcion} placeholder="Ej: El camión pasó lleno y no hizo parada..." rows="3"></textarea>
    </div>

    <div class="modal-actions">
      <button class="btn-cancel" on:click={() => dispatch('cancel')} disabled={enviando}>Cancelar</button>
      <button class="btn-submit" on:click={handleSubmit} disabled={enviando}>
        {enviando ? 'Enviando...' : 'Reportar'}
      </button>
    </div>
  </div>
</div>

<style>
  .sos-modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .sos-modal {
    background: #1e1b4b;
    padding: 40px;
    border-radius: 24px;
    border: 2px solid #ef4444;
    text-align: center;
    box-shadow: 0 0 40px rgba(239, 68, 68, 0.4);
    max-width: 400px;
    color: white;
  }

  .incidencia-modal {
    border-color: #f59e0b;
    text-align: left;
    max-width: 450px;
    width: 90%;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group label {
    display: block;
    margin-bottom: 8px;
    color: #cbd5e1;
    font-size: 14px;
  }

  .form-group select, .form-group input, .form-group textarea {
    width: 100%;
    padding: 10px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: white;
    font-family: inherit;
    box-sizing: border-box;
  }
  
  .form-group select option {
    background: #1e1b4b;
    color: white;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }

  .modal-actions button {
    flex: 1;
    padding: 12px;
    border-radius: 8px;
    font-weight: 600;
    border: none;
    cursor: pointer;
  }

  .btn-cancel {
    background: #475569;
    color: white;
  }

  .btn-submit {
    background: #f59e0b;
    color: white;
  }
</style>
