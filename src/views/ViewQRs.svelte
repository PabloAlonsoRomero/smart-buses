<script>
  import { onMount, onDestroy } from 'svelte';
  import QRCode from 'qrcode';
  import { db } from '../lib/firebase.js';
  import { ref, onValue } from 'firebase/database';

  let paradas = [];
  let qrsGenerados = {};
  let unsubscribe;

  const generarQR = async (paradaNombre) => {
    try {
      const urlApp = window.location.origin + `?parada=${encodeURIComponent(paradaNombre)}`;
      const urlData = await QRCode.toDataURL(urlApp, {
        width: 300,
        margin: 2,
        color: {
          dark: '#0f1117',
          light: '#ffffff'
        }
      });
      qrsGenerados[paradaNombre] = urlData;
      // Trigger reactivity in Svelte
      qrsGenerados = { ...qrsGenerados };
    } catch (err) {
      console.error('Error generando QR:', err);
    }
  };

  onMount(() => {
    const puntosRef = ref(db, 'puntos_interes');
    unsubscribe = onValue(puntosRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        paradas = Object.keys(data)
          .filter(name => name.toLowerCase().includes('parada'))
          .sort();
          
        // Generar todos los QRs automáticamente
        paradas.forEach(parada => {
          if (!qrsGenerados[parada]) {
            generarQR(parada);
          }
        });
      }
    });
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
</script>

<div class="qrs-container">
  <div class="header">
    <h2>Lanzamiento y Códigos QR</h2>
    <p>Genera códigos QR para imprimir y colocar en cada paradero. Los usuarios podrán escanearlos para abrir la app y ver los tiempos de llegada en esa parada específica.</p>
    {#if window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'}
      <div class="alert-warning">
        <strong>⚠️ Atención: Entorno Local</strong><br>
        Actualmente estás ejecutando la aplicación de manera local (localhost). Los códigos QR se están generando apuntando a tu computadora. <strong>Si los escaneas desde tu celular usando los datos móviles u otra red, no funcionarán.</strong> Para que cualquier persona pueda escanearlos, deberás subir esta aplicación a un hosting real (ej. Vercel, Firebase Hosting, Netlify).
      </div>
    {/if}
  </div>

  <div class="grid">
    {#each paradas as parada}
      <div class="qr-card">
        <h3>{parada}</h3>
        <p class="parada-id">Parada Registrada</p>
        
        {#if qrsGenerados[parada]}
          <div class="qr-image-container">
            <img src={qrsGenerados[parada]} alt="QR para {parada}" />
          </div>
          <button class="btn-download" on:click={() => {
            const link = document.createElement('a');
            link.download = `QR_${parada.replace(/ /g, '_')}.png`;
            link.href = qrsGenerados[parada];
            link.click();
          }}>
            Descargar QR
          </button>
        {:else}
          <div class="qr-placeholder">
            <span style="color: #64748b; font-size: 14px;">Generando...</span>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .qrs-container {
    padding: 32px;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
  }

  .header {
    margin-bottom: 32px;
    max-width: 800px;
  }

  .header h2 {
    color: #f8fafc;
    font-size: 28px;
    margin: 0 0 12px;
  }

  .header p {
    color: #94a3b8;
    font-size: 16px;
    line-height: 1.5;
    margin: 0;
  }

  .alert-warning {
    margin-top: 16px;
    padding: 16px;
    background: rgba(245, 158, 11, 0.1);
    border-left: 4px solid #f59e0b;
    border-radius: 8px;
    color: #fcd34d;
    font-size: 14px;
    line-height: 1.5;
  }
  
  .alert-warning strong {
    color: #f59e0b;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 24px;
  }

  .qr-card {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 16px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .qr-card h3 {
    margin: 0 0 8px;
    color: #e2e8f0;
    font-size: 18px;
  }

  .parada-id {
    color: #64748b;
    font-size: 14px;
    margin: 0 0 20px;
  }

  .qr-image-container {
    background: white;
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 20px;
  }

  .qr-image-container img {
    width: 200px;
    height: 200px;
    display: block;
  }

  .qr-placeholder {
    width: 200px;
    height: 200px;
    border: 2px dashed rgba(255, 255, 255, 0.2);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 20px;
  }

  .btn-generate, .btn-download {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: white;
    border: none;
    padding: 10px 20px;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    width: 100%;
  }

  .btn-download {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .btn-download:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .btn-generate:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
  }
</style>
