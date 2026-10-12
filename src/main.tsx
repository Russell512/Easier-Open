import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CloudWorkspace } from './components/CloudWorkspace'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <CloudWorkspace><App /></CloudWorkspace>
  </StrictMode>,
)
