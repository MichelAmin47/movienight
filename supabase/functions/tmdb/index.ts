// Supabase Edge Function: authenticated proxy in front of the TMDB API v3.
//
// Keeps the TMDB token out of the frontend bundle. Only signed-in users can
// call it, and only a small allowlist of TMDB endpoints is reachable.
//
// Self-contained on purpose (no local imports) so it can be deployed as-is.
// Deploy with gateway JWT verification OFF (verify_jwt = false): the function
// validates the caller's token itself, and CORS preflights carry no token.
//
// Request:  POST /functions/v1/tmdb
//           Authorization: Bearer <user access token>
//           { "path": "search/movie", "params": { "query": "shrek" } }
// Response: the TMDB JSON body with TMDB's status code.
//
// Required secret: TMDB_TOKEN (TMDB "API Read Access Token").

const TMDB_BASE = 'https://api.themoviedb.org/3'

const ALLOWED_ORIGINS = new Set([
  'https://michelamin47.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

const ALLOWED_PATHS = [
  /^search\/movie$/,
  /^movie\/\d+$/,
  /^movie\/\d+\/recommendations$/,
  /^movie\/\d+\/release_dates$/,
  /^discover\/movie$/,
  /^genre\/movie\/list$/,
]

// Never forwarded: TMDB credentials are set by this function only.
const BLOCKED_PARAMS = new Set(['api_key', 'session_id', 'guest_session_id'])

// `append_to_response` may only pull in sub-resources that are allowlisted too.
const ALLOWED_APPENDS = new Set(['release_dates', 'recommendations'])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
  if (ALLOWED_ORIGINS.has(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

/** Asks Supabase Auth whether the bearer token belongs to a signed-in user. */
async function isSignedIn(req: Request): Promise<boolean> {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!/^Bearer\s+\S+/i.test(authorization)) return false

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  // The auth API needs a project API key next to the user token. Prefer the
  // key the platform injects; fall back to the publishable key the client sent.
  const apiKey = Deno.env.get('SUPABASE_ANON_KEY') ?? req.headers.get('apikey') ?? ''
  if (!supabaseUrl || !apiKey) return false

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: authorization, apikey: apiKey },
    })
    if (!res.ok) return false
    const user = await res.json()
    // Anonymous sign-ins and bare API keys do not count as household members.
    return typeof user?.id === 'string' && user.is_anonymous !== true
  } catch {
    return false
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
  if (req.method !== 'POST') {
    return json(req, 405, { error: 'method_not_allowed' })
  }
  if (!(await isSignedIn(req))) {
    return json(req, 401, { error: 'unauthorized' })
  }

  const token = Deno.env.get('TMDB_TOKEN')
  if (!token) {
    return json(req, 500, { error: 'tmdb_token_not_configured' })
  }

  let body: { path?: unknown; params?: unknown }
  try {
    body = await req.json()
  } catch {
    return json(req, 400, { error: 'invalid_json' })
  }

  const path = typeof body.path === 'string' ? body.path.replace(/^\/+|\/+$/g, '') : ''
  if (!ALLOWED_PATHS.some((pattern) => pattern.test(path))) {
    return json(req, 403, { error: 'path_not_allowed' })
  }

  const query = new URLSearchParams({ language: 'nl-NL', region: 'NL' })
  const params = body.params && typeof body.params === 'object' ? body.params : {}
  for (const [name, value] of Object.entries(params as Record<string, unknown>)) {
    if (BLOCKED_PARAMS.has(name) || value === null || value === undefined) continue
    if (!['string', 'number', 'boolean'].includes(typeof value)) continue
    query.set(name, String(value))
  }
  query.set('include_adult', 'false')

  const appends = query.get('append_to_response')
  if (appends !== null) {
    const requested = appends.split(',').map((part) => part.trim())
    if (!/^movie\/\d+$/.test(path) || !requested.every((part) => ALLOWED_APPENDS.has(part))) {
      return json(req, 403, { error: 'append_not_allowed' })
    }
  }

  try {
    const upstream = await fetch(`${TMDB_BASE}/${path}?${query}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    return new Response(await upstream.text(), {
      status: upstream.status,
      headers: {
        ...corsHeaders(req),
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=300',
      },
    })
  } catch {
    return json(req, 502, { error: 'tmdb_unreachable' })
  }
})
