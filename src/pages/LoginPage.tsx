import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError } from '@/api/client'
import { useAuth } from '@/auth/AuthContext'
import { Banner, Button, Field, Icon, TextInput, Toggle } from '@/components/ui'

/** Manager/admin sign-in with TOTP second step (App Flow 1.5). */
export function LoginPage() {
  const { status, login } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [step, setStep] = useState<'credentials' | 'totp'>('credentials')
  const [code, setCode] = useState<string[]>(['', '', '', '', '', ''])
  const [remember, setRemember] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (!lockedUntil) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [lockedUntil])

  useEffect(() => {
    if (step === 'totp') codeRefs.current[0]?.focus()
  }, [step])

  if (status === 'signed_in') {
    const from = (location.state as { from?: string } | null)?.from ?? '/'
    return <Navigate to={from} replace />
  }

  const locked = lockedUntil !== null && lockedUntil > now

  async function submit(e?: FormEvent) {
    e?.preventDefault()
    if (locked) return
    setError(null)
    setBusy(true)
    const totp = code.join('')
    try {
      await login({ email, password, totp: step === 'totp' ? totp : undefined, remember })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'totp_required') {
          setStep('totp')
        } else if (err.code === 'invalid_totp') {
          setError('That code is not valid. Enter the current 6-digit code from your authenticator app.')
          setCode(['', '', '', '', '', ''])
          codeRefs.current[0]?.focus()
        } else if (err.code === 'locked_out') {
          setLockedUntil(Date.now() + (err.retryAfter ?? 900) * 1000)
          setError('Too many failed attempts. Sign-in is locked for 15 minutes.')
        } else if (err.code === 'ip_not_allowed') {
          setError('This network is not on the PatrolIQ access list. Connect from the HQ network or ask your administrator.')
        } else if (err.code === 'totp_not_enrolled') {
          setError('Two-factor authentication is not set up for this account. Ask your administrator for a TOTP secret.')
        } else if (err.code === 'invalid_credentials') {
          setError('Email or password is incorrect.')
          setStep('credentials')
        } else {
          setError(err.message)
        }
      } else {
        setError('Sign-in failed. Try again.')
      }
    } finally {
      setBusy(false)
    }
  }

  function setDigit(i: number, v: string) {
    const digits = v.replace(/\D/g, '')
    if (digits.length > 1) {
      const next = [...code]
      digits.slice(0, 6 - i).split('').forEach((d, j) => (next[i + j] = d))
      setCode(next)
      codeRefs.current[Math.min(5, i + digits.length)]?.focus()
      if (next.every(Boolean)) setTimeout(() => void submit(), 0)
      return
    }
    const next = [...code]
    next[i] = digits
    setCode(next)
    if (digits && i < 5) codeRefs.current[i + 1]?.focus()
  }

  const remaining = locked ? Math.ceil((lockedUntil! - now) / 1000) : 0

  return (
    <div className="flex h-full min-h-[640px]">
      <aside className="relative hidden w-[46%] flex-col justify-between overflow-hidden bg-forest p-8 text-cream lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-25"
          style={{ backgroundImage: 'radial-gradient(circle at 30% 40%, rgba(82,183,136,.35), transparent 45%), radial-gradient(circle at 75% 70%, rgba(247,231,206,.12), transparent 40%)' }}
        />
        <div />
        <div className="relative flex flex-col items-center gap-5 text-center">
          <img src="/logo-256.png" alt="PATROLIQ" className="h-52 w-52 rounded-full shadow-2xl" />
          <div>
            <p className="text-[40px] font-extrabold tracking-[0.16em]">PATROLIQ</p>
            <p className="mt-1 text-[13px] font-semibold tracking-[0.3em] text-emerald uppercase">Wildlife Intelligence</p>
          </div>
          <span className="h-px w-16 bg-cream/30" />
          <p className="max-w-sm text-body text-cream/80">Command center for managers and administrators of the Zimbabwean Wildlife Areas.</p>
        </div>
        <div className="relative flex justify-between text-[12px] text-cream/55">
          <span>Slym Shanya · University of Zimbabwe</span>
          <span>zrGISsolutions</span>
        </div>
      </aside>

      <section className="flex flex-1 items-center justify-center bg-[#FAF7F0] p-8">
        <form onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-5" noValidate>
          <div className="flex items-center gap-2 text-[12px] font-semibold tracking-[0.05em] text-ink-3 uppercase">
            <span className={`h-1 w-8 rounded ${step === 'credentials' ? 'bg-forest' : 'bg-mid-green'}`} />
            <span className={`h-1 w-8 rounded ${step === 'totp' ? 'bg-forest' : 'bg-[#E2D9C6]'}`} />
            Step {step === 'credentials' ? '1' : '2'} of 2 · {step === 'credentials' ? 'Sign in' : 'Two-factor verification'}
          </div>

          {step === 'credentials' ? (
            <>
              <div>
                <h1 className="text-h1 font-bold text-ink">Sign in</h1>
                <p className="mt-1 text-small text-ink-2">Managers and administrators. Rangers sign in on the PatrolIQ app.</p>
              </div>
              <Field label="Email" htmlFor="email">
                <TextInput id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
              </Field>
              <Field label="Password" htmlFor="password" helper="5 failed attempts lock sign-in for 15 minutes.">
                <div className="relative">
                  <TextInput
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-12"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute top-0 right-0 flex h-12 w-12 items-center justify-center text-ink-3"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} />
                  </button>
                </div>
              </Field>
            </>
          ) : (
            <>
              <div>
                <h1 className="text-h1 font-bold text-ink">Enter your authentication code</h1>
                <p className="mt-1 text-small text-ink-2">Open your authenticator app and enter the 6-digit code for PATROLIQ.</p>
              </div>
              <div className="flex items-center gap-3 rounded-lg bg-mint px-4 py-3 text-small text-forest">
                <Icon name="check_circle" size={18} />
                <span className="flex-1 truncate">{email}</span>
                <button type="button" className="font-semibold underline" onClick={() => { setStep('credentials'); setCode(['', '', '', '', '', '']) }}>
                  Change
                </button>
              </div>
              <div className="flex items-center gap-2" role="group" aria-label="Authentication code">
                {code.map((d, i) => (
                  <input
                    key={i}
                    ref={(el) => { codeRefs.current[i] = el }}
                    value={d}
                    inputMode="numeric"
                    autoComplete={i === 0 ? 'one-time-code' : 'off'}
                    maxLength={6}
                    aria-label={`Digit ${i + 1}`}
                    onChange={(e) => setDigit(i, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Backspace' && !code[i] && i > 0) codeRefs.current[i - 1]?.focus()
                    }}
                    className={`h-14 w-12 rounded-lg border-[1.5px] bg-white text-center font-mono text-[22px] outline-none focus:border-2 focus:border-forest ${i === 3 ? 'ml-3' : ''} border-grey`}
                  />
                ))}
              </div>
              <Toggle checked={remember} onChange={setRemember} label="Remember this device for 7 days" description="Only on a private, secured computer." />
            </>
          )}

          {error && <Banner tone="danger">{locked ? `${error} Try again in ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}.` : error}</Banner>}

          <Button type="submit" icon={step === 'credentials' ? 'arrow_forward' : 'verified_user'} loading={busy} disabled={locked || !email || !password || (step === 'totp' && code.join('').length !== 6)}>
            {step === 'credentials' ? 'Continue' : 'Verify'}
          </Button>

          <div className="flex flex-col gap-2 rounded-lg border border-line bg-white px-4 py-3 text-[12px] text-ink-2">
            <span className="flex items-center gap-2"><Icon name="shield" size={16} className="text-success" /> Access can be limited to approved HQ networks.</span>
            <span className="flex items-center gap-2"><Icon name="schedule" size={16} className="text-ink-3" /> Sessions end after 8 hours of inactivity. TOTP is required for managers and admins.</span>
          </div>
          <p className="text-center text-[11px] text-ink-3">Every sign-in is written to the immutable audit trail.</p>
        </form>
      </section>
    </div>
  )
}
