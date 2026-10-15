import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerSW } from 'virtual:pwa-register'
import { seedDemoIfEmpty, repairSegments } from './lib/seed' // also exposes window.seedDemo()/wipeAll()
import './styles.css'

registerSW({ immediate: true })

// Ask the browser to keep our IndexedDB durable so iOS/Safari is far less
// likely to auto-evict the vocab when the app sits unused. Silent + one-time;
// harmless if the browser declines. JSON export remains the real backstop.
async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist && navigator.storage.persisted) {
      const already = await navigator.storage.persisted()
      if (!already) await navigator.storage.persist()
    }
  } catch {
    /* ignore — not supported everywhere */
  }
}

// Seed sample words on first launch (no-op once you have your own words), then
// repair any pre-existing words whose furigana split was incomplete.
seedDemoIfEmpty()
  .then(repairSegments)
  .then(requestPersistentStorage)
  .finally(() => {
    ReactDOM.createRoot(document.getElementById('root')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    )
  })
