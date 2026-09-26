import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { registerSW } from 'virtual:pwa-register'
import { seedDemoIfEmpty } from './lib/seed' // also exposes window.seedDemo()/wipeAll()
import './styles.css'

registerSW({ immediate: true })

// Seed sample words on first launch (no-op once you have your own words).
seedDemoIfEmpty().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  )
})
