<script>
  import { onMount } from 'svelte';
  import { db } from '../lib/firebase.js';
  import { ref, get, set } from 'firebase/database';

  export let user;

  let perfil = {
    nombre: '',
    telefono: '',
    emergencia_nombre: '',
    emergencia_telefono: ''
  };

  let isSaving = false;
  let saveSuccess = false;
  let errorMessage = '';

  onMount(async () => {
    if (user) {
      try {
        const snapshot = await get(ref(db, `usuarios/${user.uid}/perfil`));
        if (snapshot.exists()) {
          const data = snapshot.val();
          perfil = { ...perfil, ...data };
        }
      } catch (err) {
        console.error("Error cargando perfil:", err);
      }
    }
  });

  const saveProfile = async () => {
    if (!user) return;
    isSaving = true;
    saveSuccess = false;
    errorMessage = '';

    try {
      await set(ref(db, `usuarios/${user.uid}/perfil`), perfil);
      saveSuccess = true;
      setTimeout(() => saveSuccess = false, 3000);
    } catch (err) {
      console.error("Error guardando perfil:", err);
      errorMessage = 'Error al guardar los datos.';
    } finally {
      isSaving = false;
    }
  };
</script>

<div class="perfil-container">
  <div class="perfil-header">
    <h2>Mi Perfil de Seguridad</h2>
    <p>Configura tu información personal y los datos de tu contacto de emergencia para habilitar el Módulo de Seguridad.</p>
  </div>

  <div class="perfil-card">
    <form on:submit|preventDefault={saveProfile}>
      
      <div class="form-section">
        <h3><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Datos Personales</h3>
        
        <div class="input-group">
          <label for="nombre">Nombre Completo</label>
          <input type="text" id="nombre" bind:value={perfil.nombre} placeholder="Ej. Juan Pérez" required />
        </div>
        
        <div class="input-group">
          <label for="telefono">Tu Teléfono</label>
          <input type="tel" id="telefono" bind:value={perfil.telefono} placeholder="Ej. 477 123 4567" required />
        </div>
      </div>

      <div class="divider"></div>

      <div class="form-section">
        <h3 style="color: #f43f5e;"><svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg> Contacto de Emergencia</h3>
        <p class="section-desc">Esta persona recibirá una notificación simulada en la app si activas una alerta SOS o cuando llegues a casa de forma segura.</p>
        
        <div class="input-group">
          <label for="emergencia_nombre">Nombre del Contacto</label>
          <input type="text" id="emergencia_nombre" bind:value={perfil.emergencia_nombre} placeholder="Ej. Mamá" required />
        </div>
        
        <div class="input-group">
          <label for="emergencia_telefono">Teléfono del Contacto</label>
          <input type="tel" id="emergencia_telefono" bind:value={perfil.emergencia_telefono} placeholder="Ej. 477 987 6543" required />
        </div>
      </div>

      {#if saveSuccess}
        <div class="success-message">¡Datos guardados correctamente!</div>
      {/if}
      
      {#if errorMessage}
        <div class="error-message">{errorMessage}</div>
      {/if}

      <div class="form-actions">
        <button type="submit" class="btn-save" disabled={isSaving}>
          {isSaving ? 'Guardando...' : 'Guardar Cambios'}
        </button>
      </div>

    </form>
  </div>
</div>

<style>
  .perfil-container {
    padding: 40px;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
  }

  .perfil-header h2 {
    font-size: 28px;
    margin: 0 0 8px 0;
    font-weight: 700;
  }

  .perfil-header p {
    color: #94a3b8;
    margin: 0 0 32px 0;
    font-size: 15px;
    max-width: 600px;
  }

  .perfil-card {
    background: rgba(15, 17, 23, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 20px;
    padding: 32px;
    max-width: 600px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(12px);
  }

  .form-section h3 {
    margin: 0 0 16px 0;
    font-size: 18px;
    display: flex;
    align-items: center;
    color: #f1f5f9;
  }

  .section-desc {
    color: #94a3b8;
    font-size: 13px;
    margin: -8px 0 16px 0;
  }

  .input-group {
    margin-bottom: 20px;
  }

  .input-group label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    font-weight: 500;
    color: #cbd5e1;
  }

  .input-group input {
    width: 100%;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: white;
    font-size: 15px;
    box-sizing: border-box;
    transition: all 0.2s;
  }

  .input-group input:focus {
    outline: none;
    border-color: #6366f1;
    background: rgba(255, 255, 255, 0.08);
  }

  .divider {
    height: 1px;
    background: rgba(255, 255, 255, 0.08);
    margin: 32px 0;
  }

  .form-actions {
    margin-top: 32px;
    display: flex;
    justify-content: flex-end;
  }

  .btn-save {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: white;
    border: none;
    padding: 12px 24px;
    border-radius: 12px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-save:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }

  .btn-save:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .success-message {
    background: rgba(34, 197, 94, 0.1);
    color: #4ade80;
    padding: 12px;
    border-radius: 12px;
    font-size: 14px;
    margin-top: 24px;
    text-align: center;
    border: 1px solid rgba(34, 197, 94, 0.2);
  }

  .error-message {
    background: rgba(239, 68, 68, 0.1);
    color: #f87171;
    padding: 12px;
    border-radius: 12px;
    font-size: 14px;
    margin-top: 24px;
    text-align: center;
    border: 1px solid rgba(239, 68, 68, 0.2);
  }
</style>
