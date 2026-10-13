import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { CloudWorkspace } from './components/CloudWorkspace'
import { SharedShortlistPage } from './components/SharedShortlistPage'
import { shareTokenFromUrl } from './lib/sharedShortlist'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {new URLSearchParams(window.location.search).has('share')
      ? <SharedShortlistPage token={shareTokenFromUrl()} />
      : <CloudWorkspace><App /></CloudWorkspace>}
  </StrictMode>,
)
