addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

const API_BASEURL = 'https://api.cloudflare.com/client/v4'

const handleRequest = async request => {
  const url = new URL(request.url)
  const queryParams = url.searchParams

  /* Only process /update endpoint */
  if (url.pathname !== '/update') {
    return JsonResponse(false, 'Bad URL path')
  }

  /* Is there an IP query param? */
  if (!queryParams.has('ip')) {
    return JsonResponse(false, 'No IP specified.', 422)
  }

  /**
   * Gets the basic auth data
   * @throws BadRequestException
   */
  const authData = handleBasicAuth(request)

  /** Gets the current userconfig
   * @throws UnauthorizedException
   */
  const config = await findUserConfig(authData.user, authData.token)

  if (queryParams.get('ip') === config.currentIp) {
    return JsonResponse(true, 'IP has not changed since last update.')
  } else {
    const success = await updateDns(authData.user, queryParams.get('ip'))
    return JsonResponse(success)
  }
}

const updateDns = async (user, ip) => {
  let recordId = await DYNKV.get(`subdomains:${user}:dns-record-id`)
  console.log('Record ID:', recordId)
  if (null === recordId) {
    recordId = await createDns(user)
    if (recordId === false) {
      throw new Error('Unexpected error on record creation')
    }
  }

  const response = await fetch(
    `${API_BASEURL}/zones/${ZONE_ID}/dns_records/${recordId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        type: 'A',
        name: user.toLowerCase(),
        content: ip,
        ttl: 120,
        proxied: false,
      }),
      headers: {
        Authorization: `Bearer ${API_TOKEN}`,
      },
    },
  )
  const json = await response.json()
  console.log(
    'Update response',
    response.status,
    json,
    JSON.stringify(json.errors),
  )
  if (response.status === 200) {
    await DYNKV.put(`subdomains:${user}:current-ip`, ip)
    return true
  }

  return false
}

const createDns = async user => {
  try {
    const response = await fetch(
      `${API_BASEURL}/zones/${ZONE_ID}/dns_records`,
      {
        method: 'POST',
        body: JSON.stringify({
          type: 'A',
          name: user.toLowerCase(),
          content: '127.0.0.1',
          ttl: 120,
          proxied: false,
        }),
        headers: {
          Authorization: `Bearer ${API_TOKEN}`,
        },
      },
    )
    const json = await response.json()
    console.log(
      'Create response',
      response.status,
      json,
      JSON.stringify(json.errors),
    )
    if (response.status === 200) {
      console.log('Record created with ID ', json.result.id)
      await DYNKV.put(`subdomains:${user}:dns-record-id`, json.result.id)
      return json.result.id
    } else {
      return false
    }
  } catch (e) {
    console.log(e.message)
    throw new Error('Creating record failed.')
  }
}

const findUserConfig = async (authUser, authToken) => {
  const token = await DYNKV.get(`subdomains:${authUser}:token`)
  if (token === null || token !== authToken) {
    throw new Error('Unauthorized')
  } else {
    const currentIp = await DYNKV.get(`subdomains:${authUser}:current-ip`)

    return {
      currentIp: currentIp,
    }
  }
}

/** Response template **/
const JsonResponse = (success, reason = '', code = 200) => {
  return new Response(
    JSON.stringify({
      success: success,
      reason: reason,
    }),
    {
      status: code,
    },
  )
}

/**
 * See documentation: https://developers.cloudflare.com/workers/examples/basic-auth
 */
const handleBasicAuth = request => {
  const Authorization = request.headers.get('Authorization')
  if (Authorization === null) {
    throw new Error('No auth credentials present.')
  }

  const [scheme, encoded] = Authorization.split(' ')

  // The Authorization header must start with "Basic", followed by a space.
  if (!encoded || scheme !== 'Basic') {
    throw new Error('Malformed authorization header.')
  }

  // Decodes the base64 value and performs unicode normalization.
  // @see https://datatracker.ietf.org/doc/html/rfc7613#section-3.3.2 (and #section-4.2.2)
  // @see https://dev.mozilla.org/docs/Web/JavaScript/Reference/Global_Objects/String/normalize
  const decoded = atob(encoded).normalize()

  // The username & password are split by the first colon.
  //=> example: "username:password"
  const index = decoded.indexOf(':')

  // The user & password are split by the first colon and MUST NOT contain control characters.
  // @see https://tools.ietf.org/html/rfc5234#appendix-B.1 (=> "CTL = %x00-1F / %x7F")
  if (index === -1 || /[\0-\x1F\x7F]/.test(decoded)) {
    throw new Error('Invalid authorization value.')
  }

  return {
    user: decoded.substring(0, index),
    token: decoded.substring(index + 1),
  }
}
