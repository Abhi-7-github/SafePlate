import { useEffect, useState } from 'react'
import './App.css'

function DecisionCard({ card }) {
  if (!card) return null

  return (
    <div className="decisionCard" role="region" aria-label="Decision card">
      <div className="decisionHeader">DECISION CARD</div>

      <div className="row">
        <span className="label">Verdict:</span>
        <span className="value">{card.verdict}</span>
      </div>

      <div className="section">
        <div className="sectionTitle">Why this matters:</div>
        <ul>
          {Array.isArray(card.whyThisMatters) &&
            card.whyThisMatters.slice(0, 2).map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
        </ul>
      </div>

      <div className="section">
        <div className="sectionTitle">Why you might care:</div>
        <ul>
          {Array.isArray(card.whyYouMightCare) &&
            card.whyYouMightCare.slice(0, 1).map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
        </ul>
      </div>

      <div className="section">
        <div className="sectionTitle">Confidence:</div>
        <div className="mono">{card.confidence}%</div>
      </div>

      <div className="section">
        <div className="sectionTitle">Uncertainty:</div>
        <ul>
          <li>{card.uncertainty}</li>
        </ul>
      </div>

      {Array.isArray(card.betterChoiceHint) && card.betterChoiceHint.length > 0 && (
        <div className="section">
          <div className="sectionTitle">Better choice hint (optional, non-pushy):</div>
          <ul>
            {card.betterChoiceHint.slice(0, 1).map((line, idx) => (
              <li key={idx}>{line}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <div className="sectionTitle">Closure:</div>
        <div>{card.closure}</div>
      </div>
    </div>
  )
}

function App() {
  const [scannedText, setScannedText] = useState('')
  const [card, setCard] = useState(null)
  const [cardText, setCardText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [apiConnected, setApiConnected] = useState(null)
  const [retryUntil, setRetryUntil] = useState(0)

  async function checkApiHealth() {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1500)
    try {
      const res = await fetch('/api/health', { signal: controller.signal })
      setApiConnected(Boolean(res.ok))
    } catch {
      setApiConnected(false)
    } finally {
      clearTimeout(t)
    }
  }

  useEffect(() => {
    checkApiHealth()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function getDecision() {
    if (retryUntil && Date.now() < retryUntil) return

    setLoading(true)
    setError('')
    setCard(null)
    setCardText('')

    await checkApiHealth()

    try {
      const res = await fetch('/api/decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scannedText }),
      })

      const data = await res.json().catch(() => null)

      if (!res.ok) {
        const reason = typeof data?.reason === 'string' ? data.reason.trim() : ''
        const primary = typeof data?.error === 'string' ? data.error.trim() : ''

        const retryAfterSeconds =
          typeof data?.retryAfterSeconds === 'number' && data.retryAfterSeconds > 0
            ? Math.ceil(data.retryAfterSeconds)
            : null
        if (retryAfterSeconds) {
          setRetryUntil(Date.now() + retryAfterSeconds * 1000)
        }

        if (reason) {
          setError(reason)
        } else if (primary) {
          setError(primary)
        } else {
          setError(`Request failed (${res.status})`)
        }
        return
      }

      setCard(data?.decisionCard ?? null)
      setCardText(typeof data?.decisionCardText === 'string' ? data.decisionCardText : '')
      if (!data?.decisionCardText && !data?.decisionCard) setError('No decision card returned.')
    } catch {
      setError('Could not reach the decision service (check server on :5050).')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1 className="title">SafePlate</h1>
      <p className="subtitle">Paste your scanned label text. Get a calm decision card.</p>

      <div className="status" aria-live="polite">
        Service: {apiConnected === null ? 'Checking…' : apiConnected ? 'Connected' : 'Not connected'}
      </div>

      <div className="panel">
        <label className="fieldLabel" htmlFor="scan">
          Scanned label text
        </label>
        <textarea
          id="scan"
          className="textarea"
          value={scannedText}
          onChange={(e) => setScannedText(e.target.value)}
          placeholder="Paste what the scanner captured…"
          rows={8}
        />

        <div className="actions">
          <button
            className="primary"
            onClick={getDecision}
            disabled={loading || (retryUntil && Date.now() < retryUntil)}
          >
            {loading
              ? 'Checking…'
              : retryUntil && Date.now() < retryUntil
                ? 'Please wait…'
                : 'Get decision card'}
          </button>
          <button
            className="secondary"
            onClick={() => {
              setScannedText('')
              setCard(null)
              setCardText('')
              setError('')
            }}
            disabled={loading}
          >
            Clear
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}
      </div>

      {cardText ? (
        <pre className="cardText" aria-label="Decision card text">
          {cardText}
        </pre>
      ) : (
        <DecisionCard card={card} />
      )}
    </div>
  )
}

export default App
