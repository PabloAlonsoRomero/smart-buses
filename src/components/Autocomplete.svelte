<script>
  export let value = '';
  export let placeholder = '';
  export let items = [];
  
  let active = false;
  let results = [];
  
  $: {
    if (value && active) {
      const term = value.toLowerCase();
      results = items.filter(i => i.toLowerCase().includes(term)).slice(0, 5);
    } else {
      results = [];
    }
  }

  function handleSelect(res) {
    value = res;
    active = false;
    results = [];
  }
</script>

<div class="autocomplete-wrapper">
  <input 
    type="text" 
    bind:value 
    {placeholder} 
    on:focus={() => active = true}
    on:blur={() => setTimeout(() => active = false, 200)}
    class="autocomplete-input"
  />
  {#if active && results.length > 0}
    <ul class="autocomplete-list">
      {#each results as res}
        <li>
          <button type="button" on:mousedown|preventDefault={() => handleSelect(res)}>
            {res}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .autocomplete-wrapper {
    position: relative;
    width: 100%;
  }

  .autocomplete-input {
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

  .autocomplete-input:focus {
    outline: none;
    border-color: #6366f1;
    background: rgba(255, 255, 255, 0.08);
  }

  .autocomplete-list {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 4px;
    margin-bottom: 0;
    padding: 8px 0;
    background: rgba(15, 17, 23, 0.95);
    backdrop-filter: blur(12px);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: 12px;
    list-style: none;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    z-index: 1000;
  }

  .autocomplete-list li button {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: #cbd5e1;
    padding: 10px 16px;
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
  }

  .autocomplete-list li button:hover {
    background: rgba(99, 102, 241, 0.2);
    color: white;
  }
</style>
