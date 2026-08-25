export type User = {
  id: number
  username: string
  email: string
}

export type PollOption = {
  id: number
  text: string
}

export type Poll = {
  id: number
  title: string
  description: string
  creator_id: number
  creator_username: string
  has_voted: boolean
  options: PollOption[]
}

export type VoteCount = {
  option_id: number
  text: string
  count: number
}

export type Session = {
  token: string
  user: User
}

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

const tokenKey = 'poll-app-token'
const userKey = 'poll-app-user'

export function getStoredSession(): Session | null {
  const token = localStorage.getItem(tokenKey)
  const storedUser = localStorage.getItem(userKey)
  if (!token || !storedUser) {
    return null
  }

  try {
    return { token, user: JSON.parse(storedUser) as User }
  } catch {
    clearStoredSession()
    return null
  }
}

export function storeSession(session: Session) {
  localStorage.setItem(tokenKey, session.token)
  localStorage.setItem(userKey, JSON.stringify(session.user))
}

export function clearStoredSession() {
  localStorage.removeItem(tokenKey)
  localStorage.removeItem(userKey)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body) {
    headers.set('Content-Type', 'application/json')
  }

  const token = localStorage.getItem(tokenKey)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(path, { ...init, headers })
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null

  if (!response.ok) {
    if (response.status === 401) {
      clearStoredSession()
    }
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? payload.error
        : undefined
    throw new ApiError(response.status, message ?? 'Something went wrong')
  }

  return payload as T
}

export function signup(input: {
  username: string
  email: string
  password: string
}) {
  return request<User>('/api/signup', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function login(identifier: string, password: string) {
  const session = await request<Session>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  })
  storeSession(session)
  return session
}

export function listPolls() {
  return request<Poll[]>('/api/polls')
}

export function getPoll(id: number) {
  return request<Poll>(`/api/polls/${id}`)
}

export function createPoll(input: {
  title: string
  description: string
  options: string[]
}) {
  return request<Poll>('/api/polls', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updatePoll(
  id: number,
  input: {
    title: string
    description: string
    options: { id: number; text: string }[]
  },
) {
  return request<Poll>(`/api/polls/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deletePoll(id: number) {
  return request<void>(`/api/polls/${id}`, { method: 'DELETE' })
}

export function vote(pollID: number, optionID: number) {
  return request<{ id: number; option_id: number }>(
    `/api/polls/${pollID}/vote`,
    {
      method: 'POST',
      body: JSON.stringify({ option_id: optionID }),
    },
  )
}

export function removeVote(pollID: number, optionID: number) {
  return request<void>(`/api/polls/${pollID}/vote`, {
    method: 'DELETE',
    body: JSON.stringify({ option_id: optionID }),
  })
}

export function getMyVotes(pollID: number) {
  return request<number[]>(`/api/polls/${pollID}/my-votes`)
}

export function getPollCounts(id: number) {
  return request<VoteCount[]>(`/api/polls/${id}/counts`)
}

export function getVoters(optionID: number) {
  return request<User[]>(`/api/options/${optionID}/voters`)
}
