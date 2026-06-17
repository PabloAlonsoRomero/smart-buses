<div class="map-legend">
  <h4>Leyenda</h4>
  <div class="legend-item">
    <span class="legend-dot" style="background: linear-gradient(135deg, #10b981, #059669);"></span>
    <span>Edificio Campus</span>
  </div>
  <div class="legend-item">
    <span class="legend-dot" style="background: linear-gradient(135deg, #ec4899, #f43f5e);"></span>
    <span>Puerta / Acceso</span>
  </div>
  <div class="legend-item">
    <span class="legend-dot" style="background: linear-gradient(135deg, #22d3ee, #3b82f6);"></span>
    <span>Parada de autobús</span>
  </div>
</div>

<style>
  .map-legend {
    position: absolute;
    bottom: 28px;
    left: 16px;
    z-index: 1000;
    padding: 14px 18px;
    background: rgba(15, 17, 23, 0.75);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 12px;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.35);
  }

  .map-legend h4 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: #94a3b8;
    text-transform: uppercase;
    letter-spacing: 0.6px;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #cbd5e1;
  }

  .legend-item + .legend-item {
    margin-top: 6px;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    box-shadow: 0 0 6px currentColor;
  }

  @media (max-width: 640px) {
    .map-legend {
      display: none;
    }
  }
</style>
