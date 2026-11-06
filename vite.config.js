import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// base './' ώστε το site να δουλεύει από οποιαδήποτε διεύθυνση (π.χ. GitHub Pages)
export default defineConfig({ plugins: [react()], base: './' })
