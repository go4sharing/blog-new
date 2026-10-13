import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchAirports } from './api'
import { normalizeAirport } from './lib'
import type { Airport } from './types'

const Ctx = createContext<{ airports: Airport[]; loading: boolean }>({ airports: [], loading: true })

export function DataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ airports: [] as Airport[], loading: true })
  useEffect(() => {
    fetchAirports()
      .then((airports) => setState({ airports: airports.map(normalizeAirport), loading: false }))
      .catch(() => setState({ airports: [], loading: false }))
  }, [])
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>
}

export const useAirports = () => useContext(Ctx)
