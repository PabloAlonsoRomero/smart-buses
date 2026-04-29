<script>
  import { onMount } from 'svelte';
  import { auth } from './lib/firebase.js';
  import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
  import ViewMap from "./views/ViewMap.svelte";
  import ViewRutas from "./views/ViewRutas.svelte";

  let currentTab = 'mapa';
  let initialFocusLocation = null;

  let user = null;
  let email = '';
  let password = '';
  let errorMsg = '';
  let loading = true;
  let isRegistering = false;

  onMount(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      user = currentUser;
      loading = false;
    });
    return unsubscribe;
  });

  const handleSubmit = async () => {
    try {
      errorMsg = '';
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') {
        errorMsg = "El correo ya está registrado.";
      } else if (err.code === 'auth/weak-password') {
        errorMsg = "La contraseña debe tener al menos 6 caracteres.";
      } else {
        errorMsg = isRegistering ? "Error al registrarse." : "Credenciales incorrectas o usuario no encontrado.";
      }
    }
  };

  const logout = async () => {
    await signOut(auth);
  };
</script>

{#if loading}
  <div class="loading">Cargando...</div>
{:else if user}
  <div class="app-layout">
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="user-avatar">
          {user.email.charAt(0).toUpperCase()}
        </div>
        <div class="user-info">
          <h3>{user.email.split('@')[0]}</h3>
          <p>{user.email}</p>
        </div>
      </div>
      <nav class="sidebar-nav">
        <button 
          class="nav-item {currentTab === 'mapa' ? 'active' : ''}" 
          on:click={() => currentTab = 'mapa'}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 12 2 21 9 21 22 3 22"></polygon><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>
          Mapa Principal
        </button>
        <button 
          class="nav-item {currentTab === 'rutas' ? 'active' : ''}" 
          on:click={() => currentTab = 'rutas'}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z"/><circle cx="12" cy="10" r="3"/></svg>
          Directorio de Rutas
        </button>
      </nav>
      <div class="sidebar-footer">
        <button class="btn-logout" on:click={logout}>
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          Cerrar Sesión
        </button>
      </div>
    </aside>
    <main class="main-content">
      {#if currentTab === 'mapa'}
        <ViewMap {initialFocusLocation} />
      {:else if currentTab === 'rutas'}
        <ViewRutas on:stopSelected={(e) => {
          initialFocusLocation = e.detail;
          currentTab = 'mapa';
        }} />
      {/if}
    </main>
  </div>
{:else}
  <div class="login-container">
    <form on:submit|preventDefault={handleSubmit} class="login-form">
      <div class="icon-container">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M8 6v6"/><path d="M16 6v6"/>
          <rect x="4" y="2" width="16" height="16" rx="3"/>
          <path d="M4 11h16"/><path d="M8 18v2"/><path d="M16 18v2"/>
          <circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/>
        </svg>
      </div>
      <h2>Smart Buses</h2>
      <p class="subtitle">{isRegistering ? 'Crea una cuenta para continuar' : 'Ingresa para ver el mapa de rutas'}</p>

      {#if errorMsg}
        <p class="error">{errorMsg}</p>
      {/if}

      <div class="input-group">
        <input type="email" bind:value={email} placeholder="Correo electrónico" required />
      </div>
      <div class="input-group">
        <input type="password" bind:value={password} placeholder="Contraseña" required />
      </div>
      
      <button type="submit" class="btn-login">{isRegistering ? 'Registrarse' : 'Iniciar Sesión'}</button>

      <p class="toggle-mode">
        {isRegistering ? '¿Ya tienes cuenta?' : '¿No tienes cuenta?'}
        <button type="button" class="btn-link" on:click={() => { isRegistering = !isRegistering; errorMsg = ''; }}>
          {isRegistering ? 'Inicia Sesión' : 'Regístrate aquí'}
        </button>
      </p>
    </form>
  </div>
{/if}

<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Inter', system-ui, sans-serif;
    background: #0f1117;
    color: #e2e8f0;
  }

  .loading {
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    font-size: 1.2rem;
    color: #6366f1;
  }

  .app-layout {
    display: flex;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }

  .sidebar {
    width: 280px;
    background: rgba(15, 17, 23, 0.95);
    border-right: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    z-index: 10;
  }

  .sidebar-header {
    padding: 24px;
    display: flex;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  }

  .user-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #22d3ee);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    font-weight: 700;
    color: white;
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.3);
  }

  .user-info {
    overflow: hidden;
  }

  .user-info h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: #f1f5f9;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .user-info p {
    margin: 4px 0 0;
    font-size: 13px;
    color: #94a3b8;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
  }

  .sidebar-nav {
    flex: 1;
    padding: 24px 16px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    color: #94a3b8;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    background: transparent;
    border: none;
    width: 100%;
    text-align: left;
    font-size: 15px;
    font-family: inherit;
  }

  .nav-item.active {
    background: rgba(99, 102, 241, 0.1);
    color: #818cf8;
  }

  .nav-item:hover:not(.active) {
    background: rgba(255, 255, 255, 0.05);
    color: #f1f5f9;
  }

  .sidebar-footer {
    padding: 24px;
    border-top: 1px solid rgba(255, 255, 255, 0.05);
  }

  .btn-logout {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.2);
    padding: 12px;
    border-radius: 12px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .btn-logout:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .main-content {
    flex: 1;
    position: relative;
  }

  /* Login Form */
  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    flex: 1;
    height: 100vh;
    background: radial-gradient(circle at center, #1e1b4b, #0f1117);
  }

  .login-form {
    background: rgba(15, 17, 23, 0.6);
    backdrop-filter: blur(16px);
    padding: 40px;
    border-radius: 24px;
    border: 1px solid rgba(99, 102, 241, 0.2);
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    width: 100%;
    max-width: 360px;
    text-align: center;
  }

  .icon-container {
    display: inline-flex;
    justify-content: center;
    align-items: center;
    width: 64px;
    height: 64px;
    background: linear-gradient(135deg, #6366f1, #22d3ee);
    border-radius: 16px;
    margin-bottom: 20px;
    box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
  }

  .icon-container svg {
    width: 32px;
    height: 32px;
    color: #ffffff;
  }

  .login-form h2 {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
  }

  .subtitle {
    margin: 8px 0 24px;
    font-size: 14px;
    color: #94a3b8;
  }

  .input-group {
    margin-bottom: 16px;
  }

  .input-group input {
    width: 100%;
    padding: 12px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    color: #f8fafc;
    font-size: 14px;
    box-sizing: border-box;
    transition: all 0.3s ease;
  }

  .input-group input:focus {
    outline: none;
    border-color: #6366f1;
    background: rgba(255, 255, 255, 0.1);
  }

  .btn-login {
    width: 100%;
    padding: 12px;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    margin-top: 8px;
  }

  .btn-login:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }

  .error {
    color: #f87171;
    background: rgba(248, 113, 113, 0.1);
    padding: 8px;
    border-radius: 8px;
    font-size: 13px;
    margin-bottom: 16px;
  }

  .toggle-mode {
    margin-top: 24px;
    font-size: 14px;
    color: #94a3b8;
  }

  .btn-link {
    background: none;
    border: none;
    color: #6366f1;
    font-weight: 600;
    cursor: pointer;
    padding: 0 4px;
    font-size: inherit;
    font-family: inherit;
  }

  .btn-link:hover {
    text-decoration: underline;
  }
</style>