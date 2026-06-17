<script>
  export let message = "✅ Has llegado a tu destino. Se ha notificado a tu contacto de emergencia.";
</script>

<div class="safe-commute-success">
  {message}
</div>

<style>
  .safe-commute-success {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(34, 197, 94, 0.95);
    color: white;
    padding: 16px 24px;
    border-radius: 16px;
    font-weight: 600;
    font-size: 15px;
    z-index: 2000;
    box-shadow: 0 8px 32px rgba(34, 197, 94, 0.4);
    animation: slideDown 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
  }

  @keyframes slideDown {
    from { top: -50px; opacity: 0; }
    to { top: 20px; opacity: 1; }
  }
</style>
