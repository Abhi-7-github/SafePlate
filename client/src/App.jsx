import { useEffect, useRef, useState } from 'react'
import './App.css'
import { TextGenerateEffect } from '@/components/ui/text-generate-effect'

const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '').toString().replace(/\/$/, '')
function apiUrl(path) {
  if (!API_BASE) return path
  return `${API_BASE}${path}`
}

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

const LANGS = [
  { code: 'auto', label: 'Auto (detect)' },
  { code: 'en', label: 'English' },
  { code: 'as', label: 'অসমীয়া (Assamese)' },
  { code: 'bn', label: 'বাংলা (Bengali)' },
  { code: 'brx', label: 'बड़ो (Bodo)' },
  { code: 'doi', label: 'डोगरी (Dogri)' },
  { code: 'gu', label: 'ગુજરાતી (Gujarati)' },
  { code: 'hi', label: 'हिन्दी (Hindi)' },
  { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
  { code: 'ks', label: 'کٲشُر / कश्मीरी (Kashmiri)' },
  { code: 'kok', label: 'कोंकणी (Konkani)' },
  { code: 'mai', label: 'मैथिली (Maithili)' },
  { code: 'ml', label: 'മലയാളം (Malayalam)' },
  { code: 'mni-Mtei', label: 'ꯃꯤꯇꯩꯂꯣꯟ (Manipuri/Meitei)' },
  { code: 'mr', label: 'मराठी (Marathi)' },
  { code: 'ne', label: 'नेपाली (Nepali)' },
  { code: 'or', label: 'ଓଡ଼ିଆ (Odia)' },
  { code: 'pa', label: 'ਪੰਜਾਬੀ (Punjabi)' },
  { code: 'sa', label: 'संस्कृतम् (Sanskrit)' },
  { code: 'sat', label: 'ᱥᱟᱱᱛᱟᱲᱤ (Santali)' },
  { code: 'sd', label: 'سنڌي / सिन्धी (Sindhi)' },
  { code: 'ta', label: 'தமிழ் (Tamil)' },
  { code: 'te', label: 'తెలుగు (Telugu)' },
  { code: 'ur', label: 'اردو (Urdu)' },
]

const I18N = {
  en: {
    title: 'SafePlate',
    subtitle: 'Use your camera or paste label text. Get a calm decision card.',
    service: 'Service:',
    checking: 'Checking…',
    connected: 'Connected',
    notConnected: 'Not connected',
    cameraScan: 'Camera scan (OCR)',
    enhance: 'Enhance',
    sparseText: 'Sparse text',
    startCamera: 'Start camera',
    stopCamera: 'Stop camera',
    captureRead: 'Capture & read',
    reading: 'Reading…',
    scannedLabelText: 'Scanned label text',
    placeholder: 'Paste what the scanner captured…',
    getDecision: 'Get decision card',
    checkingDecision: 'Checking…',
    pleaseWait: 'Please wait…',
    clear: 'Clear',
    decisionCard: 'DECISION CARD',
    verdict: 'Verdict:',
    whyThisMatters: 'Why this matters:',
    whyYouMightCare: 'Why you might care:',
    confidence: 'Confidence:',
    uncertainty: 'Uncertainty:',
    betterChoiceHint: 'Better choice hint (optional, non-pushy):',
    closure: 'Closure:',
    language: 'Language',
  },
  hi: {
    title: 'SafePlate',
    subtitle: 'कैमरा इस्तेमाल करें या टेक्स्ट पेस्ट करें। शांत निर्णय कार्ड पाएं।',
    service: 'सेवा:',
    checking: 'जाँच हो रही है…',
    connected: 'कनेक्टेड',
    notConnected: 'कनेक्ट नहीं है',
    cameraScan: 'कैमरा स्कैन (OCR)',
    enhance: 'बेहतर करें',
    sparseText: 'बिखरा हुआ टेक्स्ट',
    startCamera: 'कैमरा शुरू करें',
    stopCamera: 'कैमरा बंद करें',
    captureRead: 'कैप्चर करें और पढ़ें',
    reading: 'पढ़ रहा है…',
    scannedLabelText: 'स्कैन किया गया लेबल टेक्स्ट',
    placeholder: 'स्कैनर ने जो कैप्चर किया वह पेस्ट करें…',
    getDecision: 'निर्णय कार्ड पाएं',
    checkingDecision: 'जाँच हो रही है…',
    pleaseWait: 'कृपया प्रतीक्षा करें…',
    clear: 'साफ़ करें',
    decisionCard: 'निर्णय कार्ड',
    verdict: 'निर्णय:',
    whyThisMatters: 'यह क्यों मायने रखता है:',
    whyYouMightCare: 'आपको क्यों परवाह हो सकती है:',
    confidence: 'विश्वास:',
    uncertainty: 'अनिश्चितता:',
    betterChoiceHint: 'बेहतर विकल्प संकेत (वैकल्पिक, बिना दबाव):',
    closure: 'समापन:',
    language: 'भाषा',
  },
}

function getStrings(lang) {
  return I18N[lang] || I18N.en
}

function DecisionCardLocalized({ card, s }) {
  if (!card) return null

  return (
    <div className="decisionCard" role="region" aria-label="Decision card">
      <div className="decisionHeader">{s.decisionCard}</div>

      <div className="row">
        <span className="label">{s.verdict}</span>
        <div className="value">
          <TextGenerateEffect words={String(card.verdict ?? '')} filter={true} duration={0.35} />
        </div>
      </div>

      <div className="section">
        <div className="sectionTitle">{s.whyThisMatters}</div>
        <ul>
          {Array.isArray(card.whyThisMatters) &&
            card.whyThisMatters
              .slice(0, 2)
              .map((line, idx) => (
                <li key={idx}>
                  <TextGenerateEffect words={String(line ?? '')} filter={true} duration={0.35} />
                </li>
              ))}
        </ul>
      </div>

      <div className="section">
        <div className="sectionTitle">{s.whyYouMightCare}</div>
        <ul>
          {Array.isArray(card.whyYouMightCare) &&
            card.whyYouMightCare
              .slice(0, 1)
              .map((line, idx) => (
                <li key={idx}>
                  <TextGenerateEffect words={String(line ?? '')} filter={true} duration={0.35} />
                </li>
              ))}
        </ul>
      </div>

      <div className="section">
        <div className="sectionTitle">{s.confidence}</div>
        <div className="mono">{card.confidence}%</div>
      </div>

      <div className="section">
        <div className="sectionTitle">{s.uncertainty}</div>
        <ul>
          <li>
            <TextGenerateEffect words={String(card.uncertainty ?? '')} filter={true} duration={0.35} />
          </li>
        </ul>
      </div>

      {Array.isArray(card.betterChoiceHint) && card.betterChoiceHint.length > 0 && (
        <div className="section">
          <div className="sectionTitle">{s.betterChoiceHint}</div>
          <ul>
            {card.betterChoiceHint.slice(0, 1).map((line, idx) => (
              <li key={idx}>
                <TextGenerateEffect words={String(line ?? '')} filter={true} duration={0.35} />
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="section">
        <div className="sectionTitle">{s.closure}</div>
        <div>
          <TextGenerateEffect words={String(card.closure ?? '')} filter={true} duration={0.35} />
        </div>
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

  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [cameraOn, setCameraOn] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrError, setOcrError] = useState('')
  const [enhanceOcr, setEnhanceOcr] = useState(true)
  const [sparseText, setSparseText] = useState(false)
  const [language, setLanguage] = useState('auto')

  const s = getStrings(language)

  useEffect(() => {
    document.documentElement.classList.add('dark')
    return () => document.documentElement.classList.remove('dark')
  }, [])

  async function checkApiHealth() {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 1500)
    try {
      const res = await fetch(apiUrl('/api/health'), { signal: controller.signal })
      setApiConnected(Boolean(res.ok))
    } catch {
      setApiConnected(false)
    } finally {
      clearTimeout(t)
    }
  }

  async function attachStreamToVideo(stream) {
    // The <video> element is only rendered when cameraOn=true.
    // So we may need to wait a tick for it to mount.
    const startedAt = Date.now()
    while (!videoRef.current && Date.now() - startedAt < 1500) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 50))
    }

    const video = videoRef.current
    if (!video) return false

    video.onloadedmetadata = () => {
      video.play().catch(() => {})
      if ((video.videoWidth || 0) > 0 && (video.videoHeight || 0) > 0) setCameraReady(true)
    }
    video.oncanplay = () => {
      if ((video.videoWidth || 0) > 0 && (video.videoHeight || 0) > 0) setCameraReady(true)
    }

    video.srcObject = stream
    await video.play().catch(() => {})
    return true
  }

  async function startCamera() {
    setOcrError('')
    setCameraReady(false)
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraOn(false)
        setOcrError('Camera is not supported in this browser.')
        return
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })
      streamRef.current = stream
      setCameraOn(true)

      const attached = await attachStreamToVideo(stream)
      if (!attached) {
        setOcrError('Camera started, but preview could not initialize. Please try again.')
        return
      }

      // Proactively wait a moment for the first real frame.
      // This avoids getting stuck in a state where the stream is granted but the video element reports 0x0.
      const ok = await waitForVideoReady(4000)
      setCameraReady(ok)
      if (!ok) {
        setOcrError('Camera started, but no video frames are available yet. Try again, or switch browser (Chrome/Edge).')
      }
    } catch (err) {
      setCameraOn(false)
      setCameraReady(false)

      const name = err && typeof err === 'object' && 'name' in err ? String(err.name) : ''
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        setOcrError('Camera permission was blocked. Allow camera access in the browser site settings and try again.')
        return
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        setOcrError('No camera device found.')
        return
      }
      if (name === 'NotReadableError' || name === 'TrackStartError') {
        setOcrError('Camera is already in use by another app/tab. Close it and try again.')
        return
      }
      if (name === 'SecurityError') {
        setOcrError('Camera requires a secure context (HTTPS) or localhost.')
        return
      }

      setOcrError('Could not access camera. Check permissions and try again.')
    }
  }

  function stopCamera() {
    const stream = streamRef.current
    if (stream) {
      for (const track of stream.getTracks()) track.stop()
    }
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
    setCameraReady(false)
  }

  async function waitForVideoReady(timeoutMs = 2500) {
    const video = videoRef.current
    if (!video) return false

    const hasDims = () => (video.videoWidth || 0) > 0 && (video.videoHeight || 0) > 0
    if (hasDims()) return true

    const start = Date.now()
    return await new Promise((resolve) => {
      let done = false
      const finish = (value) => {
        if (done) return
        done = true
        cleanup()
        resolve(value)
      }

      const onReady = () => {
        if (hasDims()) finish(true)
      }

      const tick = () => {
        if (hasDims()) finish(true)
        if (Date.now() - start >= timeoutMs) finish(false)
      }

      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onReady)
        video.removeEventListener('canplay', onReady)
        video.removeEventListener('playing', onReady)
        clearInterval(interval)
        clearTimeout(timeout)
      }

      video.addEventListener('loadedmetadata', onReady)
      video.addEventListener('canplay', onReady)
      video.addEventListener('playing', onReady)

      const interval = setInterval(tick, 100)
      const timeout = setTimeout(() => finish(false), timeoutMs + 50)

      // Best-effort: if available, wait for a decoded frame callback.
      // This is often more reliable than canplay/playing on some devices.
      try {
        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(() => {
            if (hasDims()) finish(true)
          })
        }
      } catch {
        // ignore
      }

      tick()
    })
  }

  function captureFrameAsDataUrl() {
    const video = videoRef.current
    if (!video) return null
    const vw = video.videoWidth || 0
    const vh = video.videoHeight || 0
    if (!vw || !vh) return null

    const maxWidth = enhanceOcr ? 1920 : 1600
    const scale = vw > maxWidth ? maxWidth / vw : 1
    const w = Math.round(vw * scale)
    const h = Math.round(vh * scale)

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, w, h)

    // Crop to a centered scan window to reduce background noise.
    // Labels are typically a dense block; the center crop tends to work well.
    const cropW = Math.round(w * 0.9)
    const cropH = Math.round(h * 0.6)
    const cropX = Math.round((w - cropW) / 2)
    const cropY = Math.round((h - cropH) / 2)

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = cropW
    cropCanvas.height = cropH
    const cropCtx = cropCanvas.getContext('2d')
    if (!cropCtx) return null
    cropCtx.drawImage(canvas, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH)

    if (enhanceOcr) {
      // Upscale slightly before thresholding.
      const upScale = 1.6
      const upW = Math.min(2200, Math.round(cropW * upScale))
      const upH = Math.min(1600, Math.round(cropH * upScale))
      const upCanvas = document.createElement('canvas')
      upCanvas.width = upW
      upCanvas.height = upH
      const upCtx = upCanvas.getContext('2d')
      if (!upCtx) return null
      upCtx.imageSmoothingEnabled = true
      upCtx.drawImage(cropCanvas, 0, 0, cropW, cropH, 0, 0, upW, upH)

      const img = upCtx.getImageData(0, 0, upW, upH)
      const data = img.data

      // Simple contrast + thresholding to help OCR.
      // Keeps UI minimal but improves results for small label text.
      let sum = 0
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        sum += lum
      }
      const avg = sum / (data.length / 4)
      const threshold = avg * 0.9
      const contrast = 1.35

      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
        let v = (lum - 128) * contrast + 128
        v = v < 0 ? 0 : v > 255 ? 255 : v
        const bw = v > threshold ? 255 : 0
        data[i] = bw
        data[i + 1] = bw
        data[i + 2] = bw
      }

      upCtx.putImageData(img, 0, 0)
      return upCanvas.toDataURL('image/png')
    }

    return cropCanvas.toDataURL('image/jpeg', 0.92)
  }

  async function captureAndOcr() {
    setOcrError('')
    setError('')
    setOcrLoading(true)

    try {
      let imageDataUrl = captureFrameAsDataUrl()
      if (!imageDataUrl) {
        // Immediately after starting the camera, some browsers report 0x0 dimensions briefly.
        const ok = await waitForVideoReady(2500)
        if (ok) {
          setCameraReady(true)
          imageDataUrl = captureFrameAsDataUrl()
        }
      }
      if (!imageDataUrl) {
        setOcrError('Camera not ready yet. Try again in a moment.')
        return
      }

      const res = await fetch(apiUrl('/api/ocr'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageDataUrl,
          options: { psm: sparseText ? 11 : 6 },
        }),
      })

      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) {
        const msg = typeof data?.error === 'string' ? data.error : `OCR failed (${res.status})`
        setOcrError(msg)
        return
      }

      const text = typeof data?.text === 'string' ? data.text : ''
      if (!text.trim()) {
        setOcrError('No readable text detected. Try better lighting and focus.')
        return
      }

      setScannedText(text)
    } catch {
      setOcrError('Could not reach OCR service (check server on :5050).')
    } finally {
      setOcrLoading(false)
    }
  }

  useEffect(() => {
    return () => {
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      const res = await fetch(apiUrl('/api/decision'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scannedText, language }),
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

      // If user chose Auto, lock onto the resolved language after first response.
      if (language === 'auto' && typeof data?.resolvedLanguage === 'string' && data.resolvedLanguage) {
        setLanguage(data.resolvedLanguage)
      }
    } catch {
      setError('Could not reach the decision service (check server on :5050).')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <h1 className="title">{s.title}</h1>
      <p className="subtitle">{s.subtitle}</p>

      <div className="status" aria-live="polite">
        {s.service} {apiConnected === null ? s.checking : apiConnected ? s.connected : s.notConnected}
      </div>

      <div className="panel">
        <div className="row" style={{ alignItems: 'center' }}>
          <span className="label">{s.language}:</span>
          <select
            className="select"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            disabled={loading || ocrLoading}
            aria-label="Language"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div className="cameraPanel">
          {!cameraOn ? (
            <div className="cameraCollapsed">
              <div className="fieldLabel">{s.cameraScan}</div>
              <button className="secondary" onClick={startCamera} disabled={loading || ocrLoading}>
                {s.startCamera}
              </button>
            </div>
          ) : (
            <>
              <div className="cameraHeader">
                <div className="fieldLabel">{s.cameraScan}</div>
                <div className="cameraActions">
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={enhanceOcr}
                      onChange={(e) => setEnhanceOcr(e.target.checked)}
                      disabled={loading || ocrLoading}
                    />
                    {s.enhance}
                  </label>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={sparseText}
                      onChange={(e) => setSparseText(e.target.checked)}
                      disabled={loading || ocrLoading}
                    />
                    {s.sparseText}
                  </label>
                  <button className="secondary" onClick={stopCamera} disabled={loading || ocrLoading}>
                    {s.stopCamera}
                  </button>
                  <button className="primary" onClick={captureAndOcr} disabled={loading || ocrLoading}>
                    {ocrLoading ? s.reading : s.captureRead}
                  </button>
                </div>
              </div>

              <div className="cameraViewport">
                <video ref={videoRef} className="video" playsInline muted autoPlay />
                <div className="scanWindow" aria-hidden="true" />
              </div>

              {!cameraReady ? (
                <div className="muted" style={{ marginTop: 8 }}>
                  Warming up camera…
                </div>
              ) : null}
            </>
          )}

          {ocrError ? <div className="error">{ocrError}</div> : null}
        </div>

        <label className="fieldLabel" htmlFor="scan">{s.scannedLabelText}</label>
        <textarea
          id="scan"
          className="textarea"
          value={scannedText}
          onChange={(e) => setScannedText(e.target.value)}
          placeholder={s.placeholder}
          rows={8}
        />

        <div className="actions">
          <button
            className="primary"
            onClick={getDecision}
            disabled={loading || (retryUntil && Date.now() < retryUntil)}
          >
            {loading
              ? s.checkingDecision
              : retryUntil && Date.now() < retryUntil
                ? s.pleaseWait
                : s.getDecision}
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
            {s.clear}
          </button>
        </div>

        {error ? <div className="error">{error}</div> : null}
      </div>

      {cardText ? (
        <pre className="cardText" aria-label="Decision card text">
          {cardText}
        </pre>
      ) : (
        <DecisionCardLocalized card={card} s={s} />
      )}
    </div>
  )
}

export default App
