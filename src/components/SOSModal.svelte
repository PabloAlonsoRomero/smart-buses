<script>
  import { ShieldAlert } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  
  export let countdown = 3;
  const dispatch = createEventDispatcher();
</script>

<div class="sos-modal-overlay">
  <div class="sos-modal">
    <ShieldAlert size={64} color="#ef4444" />
    <h2>ALERTA DE SEGURIDAD</h2>
    <p>Enviando ubicación a tus contactos de emergencia y seguridad en:</p>
    <div class="countdown">{countdown}</div>
    <button class="btn-cancel-sos" on:click={() => dispatch('cancel')}>Cancelar Alerta</button>
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

  .sos-modal h2 {
    color: #ef4444;
    margin: 16px 0 8px 0;
    font-size: 24px;
    font-weight: 800;
  }

  .countdown {
    font-size: 72px;
    font-weight: 900;
    color: white;
    margin: 24px 0;
  }

  .btn-cancel-sos {
    background: #475569;
    color: white;
    border: none;
    padding: 12px 32px;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    width: 100%;
    transition: background 0.2s;
  }

  .btn-cancel-sos:hover {
    background: #64748b;
  }
</style>
