import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './index.css'
import { DataProvider } from './data'
import { Layout } from './components/Layout'
import Home from './pages/Home'
import Category from './pages/Category'
import Detail from './pages/Detail'
import Search from './pages/Search'
import Submit from './pages/Submit'
import Admin from './pages/Admin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
      <DataProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="category/:tag?" element={<Category />} />
            <Route path="airport/:id" element={<Detail />} />
            <Route path="search" element={<Search />} />
            <Route path="submit" element={<Submit />} />
            <Route path="admin" element={<Admin />} />
            <Route path="*" element={<p className="py-10 text-center text-sm text-muted">页面不存在</p>} />
          </Route>
        </Routes>
      </DataProvider>
    </BrowserRouter>
  </StrictMode>,
)
