import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './auth'
import './style.css'

// Χωρίς StrictMode: η αρχική σελίδα καταγράφει εμφανίσεις κομμάτων και δεν πρέπει να διπλομετριέται.
createRoot(document.getElementById('root')).render(
  <HashRouter>
    <AuthProvider>
      <App />
    </AuthProvider>
  </HashRouter>
)
