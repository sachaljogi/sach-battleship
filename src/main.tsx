import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { createRng } from './game/rng'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App rng={createRng(crypto.getRandomValues(new Uint32Array(1))[0]!)} />
  </StrictMode>,
)
