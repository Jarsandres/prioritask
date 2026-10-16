import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// H4: import selectivo de Bootstrap (sólo módulos usados) en lugar del CSS completo.
import './styles/bootstrap-custom.scss';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
