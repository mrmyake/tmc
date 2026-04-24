'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// useSearchParams bail-out vereist een Suspense-boundary bij static
// export. Pagina moet sowieso client-side draaien voor de hash-fragment
// parsing, dus force-dynamic voorkomt dat Next 'm probeert te prerenden.
export const dynamic = 'force-dynamic'

export default function ImplicitCallbackPage() {
  return (
    <Suspense
      fallback={
        <p style={{ padding: '2rem', fontFamily: 'system-ui' }}>Inloggen…</p>
      }
    >
      <ImplicitCallback />
    </Suspense>
  )
}

function ImplicitCallback() {
  const router = useRouter()
  const params = useSearchParams()
  const [msg, setMsg] = useState('Inloggen…')

  useEffect(() => {
    const run = async () => {
      const hash = new URLSearchParams(window.location.hash.substring(1))
      const access_token = hash.get('access_token')
      const refresh_token = hash.get('refresh_token')
      const next = params.get('next') ?? '/app'

      if (!access_token || !refresh_token) {
        router.replace('/login?error=no_tokens')
        return
      }

      const supabase = createClient()
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      })

      if (error) {
        setMsg(`Fout: ${error.message}`)
        router.replace(`/login?error=${encodeURIComponent(error.message)}`)
        return
      }

      // Hard reload zodat server-side components de nieuwe cookies oppakken
      window.location.replace(next)
    }
    run()
  }, [params, router])

  return <p style={{ padding: '2rem', fontFamily: 'system-ui' }}>{msg}</p>
}
