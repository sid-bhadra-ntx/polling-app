import { useCallback, useEffect, useState } from 'react'
import './App.css'
import {
  ApiError,
  clearStoredSession,
  createPoll,
  deletePoll,
  getPollCounts,
  getStoredSession,
  getVoters,
  listPolls,
  login,
  signup,
  updatePoll,
  vote,
} from './api'
import type { Poll, Session, User, VoteCount } from './api'

type Page = 'list' | 'detail' | 'editor'

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return error.message
  }
  return 'Could not connect to the polling service. Try again.'
}

function App() {
  const [session, setSession] = useState<Session | null>(getStoredSession)
  const handleUnauthorized = useCallback(() => setSession(null), [])
  const handleLogout = useCallback(() => {
    clearStoredSession()
    setSession(null)
  }, [])

  if (!session) {
    return <AuthPage onAuthenticated={setSession} />
  }

  return (
    <AppShell
      session={session}
      onLogout={handleLogout}
      onUnauthorized={handleUnauthorized}
    />
  )
}

type AuthPageProps = {
  onAuthenticated: (session: Session) => void
}

function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [identifier, setIdentifier] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setNotice('')

    if (password.length < 1) {
      setError('Password is required.')
      return
    }
    if (mode === 'signup' && (!username.trim() || !email.trim())) {
      setError('Username and email are required.')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        const nextSession = await login(identifier.trim(), password)
        onAuthenticated(nextSession)
      } else {
        await signup({ username: username.trim(), email: email.trim(), password })
        setMode('login')
        setIdentifier(username.trim())
        setPassword('')
        setNotice('Account created. Sign in to continue.')
      }
    } catch (submissionError) {
      setError(errorMessage(submissionError))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-card">
        <div className="brand-mark">P</div>
        <p className="eyebrow">POLLING APP</p>
        <h1>{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="muted">
          {mode === 'login'
            ? 'Sign in to share your opinion.'
            : 'Create polls and see what people think.'}
        </p>

        {error && <ErrorBanner message={error} />}
        {notice && <div className="notice">{notice}</div>}

        <form onSubmit={handleSubmit} className="stack-form">
          {mode === 'signup' && (
            <>
              <label>
                Username
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  autoComplete="username"
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </label>
            </>
          )}
          {mode === 'login' && (
            <label>
              Username or email
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
          )}
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
            />
          </label>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting
              ? 'Please wait…'
              : mode === 'login'
                ? 'Sign in'
                : 'Create account'}
          </button>
        </form>

        <button
          type="button"
          className="text-button auth-switch"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError('')
            setNotice('')
          }}
        >
          {mode === 'login'
            ? 'Need an account? Sign up'
            : 'Already have an account? Sign in'}
        </button>
      </section>
    </main>
  )
}

type AppShellProps = {
  session: Session
  onLogout: () => void
  onUnauthorized: () => void
}

function AppShell({ session, onLogout, onUnauthorized }: AppShellProps) {
  const [page, setPage] = useState<Page>('list')
  const [selectedPoll, setSelectedPoll] = useState<Poll | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [actionError, setActionError] = useState('')

  function openPoll(poll: Poll) {
    setSelectedPoll(poll)
    setPage('detail')
    setActionError('')
  }

  function startCreate() {
    setSelectedPoll(null)
    setPage('editor')
    setActionError('')
  }

  async function handleDelete(poll: Poll) {
    if (!window.confirm(`Delete “${poll.title}”? This cannot be undone.`)) {
      return
    }
    setActionError('')
    try {
      await deletePoll(poll.id)
      setSelectedPoll(null)
      setPage('list')
      setRefreshKey((key) => key + 1)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized()
      } else {
        setActionError(errorMessage(error))
      }
    }
  }

  function handleSaved(poll: Poll) {
    setSelectedPoll(poll)
    setPage('detail')
    setRefreshKey((key) => key + 1)
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          type="button"
          className="brand-button"
          onClick={() => {
            setPage('list')
            setSelectedPoll(null)
          }}
        >
          <span className="brand-mark small">P</span>
          <span>Pulse Polls</span>
        </button>
        <div className="topbar-actions">
          <span className="user-chip">{session.user.username}</span>
          <button type="button" className="secondary-button" onClick={onLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="content">
        {actionError && <ErrorBanner message={actionError} />}
        {page === 'list' && (
          <PollList
            key={refreshKey}
            currentUser={session.user}
            refreshKey={refreshKey}
            onOpen={openPoll}
            onCreate={startCreate}
            onUnauthorized={onUnauthorized}
          />
        )}
        {page === 'detail' && selectedPoll && (
          <PollDetail
            poll={selectedPoll}
            currentUser={session.user}
            onBack={() => setPage('list')}
            onEdit={() => setPage('editor')}
            onDelete={() => void handleDelete(selectedPoll)}
            onUnauthorized={onUnauthorized}
          />
        )}
        {page === 'editor' && (
          <PollEditor
            poll={selectedPoll}
            currentUser={session.user}
            onCancel={() =>
              selectedPoll ? setPage('detail') : setPage('list')
            }
            onSaved={handleSaved}
            onUnauthorized={onUnauthorized}
          />
        )}
      </main>
    </div>
  )
}

type PollListProps = {
  currentUser: User
  refreshKey: number
  onOpen: (poll: Poll) => void
  onCreate: () => void
  onUnauthorized: () => void
}

function PollList({
  currentUser,
  refreshKey,
  onOpen,
  onCreate,
  onUnauthorized,
}: PollListProps) {
  const [polls, setPolls] = useState<Poll[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listPolls()
      .then((nextPolls) => {
        if (active) {
          setPolls(nextPolls)
        }
      })
      .catch((loadError: unknown) => {
        if (!active) {
          return
        }
        if (loadError instanceof ApiError && loadError.status === 401) {
          onUnauthorized()
        } else {
          setError(errorMessage(loadError))
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [refreshKey, onUnauthorized])

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DISCOVER</p>
          <h1>All polls</h1>
          <p className="muted">Ask a question. Start a conversation.</p>
        </div>
        <button type="button" className="primary-button" onClick={onCreate}>
          <span aria-hidden="true">＋</span> Create poll
        </button>
      </div>

      {loading && <LoadingState label="Loading polls…" />}
      {error && (
        <div className="state-card">
          <ErrorBanner message={error} />
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Try again
          </button>
        </div>
      )}
      {!loading && !error && polls.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">?</div>
          <h2>No polls yet</h2>
          <p className="muted">Be the first person to ask a question.</p>
          <button type="button" className="primary-button" onClick={onCreate}>
            Create the first poll
          </button>
        </div>
      )}
      {!loading && !error && polls.length > 0 && (
        <div className="poll-grid">
          {polls.map((poll) => (
            <article className="poll-card" key={poll.id}>
              <div className="poll-card-top">
                <span className="option-count">
                  {poll.options.length} options
                </span>
                {poll.creator_id === currentUser.id && (
                  <span className="owner-label">Your poll</span>
                )}
              </div>
              <h2>{poll.title}</h2>
              <p className="poll-description">
                {poll.description || 'No description provided.'}
              </p>
              <div className="poll-card-footer">
                <span className="muted">Ready for your vote</span>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => onOpen(poll)}
                >
                  View poll →
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

type PollDetailProps = {
  poll: Poll
  currentUser: User
  onBack: () => void
  onEdit: () => void
  onDelete: () => void
  onUnauthorized: () => void
}

function PollDetail({
  poll,
  currentUser,
  onBack,
  onEdit,
  onDelete,
  onUnauthorized,
}: PollDetailProps) {
  const [counts, setCounts] = useState<Record<number, number>>({})
  const [loadingCounts, setLoadingCounts] = useState(true)
  const [loadingVote, setLoadingVote] = useState<number | null>(null)
  const [votedOptions, setVotedOptions] = useState<Set<number>>(new Set())
  const [error, setError] = useState('')
  const [expandedOption, setExpandedOption] = useState<number | null>(null)
  const [voters, setVoters] = useState<Record<number, User[]>>({})
  const [loadingVoters, setLoadingVoters] = useState<number | null>(null)
  const [voterError, setVoterError] = useState('')

  const loadCounts = useCallback(async () => {
    setLoadingCounts(true)
    try {
      const nextCounts = await getPollCounts(poll.id)
      setCounts(
        Object.fromEntries(
          nextCounts.map((item: VoteCount) => [item.option_id, item.count]),
        ),
      )
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        onUnauthorized()
      } else {
        setError(errorMessage(loadError))
      }
    } finally {
      setLoadingCounts(false)
    }
  }, [onUnauthorized, poll.id])

  useEffect(() => {
    let active = true
    getPollCounts(poll.id)
      .then((nextCounts) => {
        if (active) {
          setCounts(
            Object.fromEntries(
              nextCounts.map((item: VoteCount) => [
                item.option_id,
                item.count,
              ]),
            ),
          )
        }
      })
      .catch((loadError: unknown) => {
        if (!active) {
          return
        }
        if (loadError instanceof ApiError && loadError.status === 401) {
          onUnauthorized()
        } else {
          setError(errorMessage(loadError))
        }
      })
      .finally(() => {
        if (active) {
          setLoadingCounts(false)
        }
      })
    return () => {
      active = false
    }
  }, [onUnauthorized, poll.id])

  async function handleVote(optionID: number) {
    setError('')
    setLoadingVote(optionID)
    try {
      await vote(poll.id, optionID)
      setVotedOptions((previous) => new Set(previous).add(optionID))
      await loadCounts()
    } catch (voteError) {
      if (voteError instanceof ApiError && voteError.status === 401) {
        onUnauthorized()
      } else {
        setError(errorMessage(voteError))
      }
    } finally {
      setLoadingVote(null)
    }
  }

  async function toggleVoters(optionID: number) {
    setVoterError('')
    if (expandedOption === optionID) {
      setExpandedOption(null)
      return
    }
    setExpandedOption(optionID)
    if (voters[optionID]) {
      return
    }
    setLoadingVoters(optionID)
    try {
      const nextVoters = await getVoters(optionID)
      setVoters((previous) => ({ ...previous, [optionID]: nextVoters }))
    } catch (voterLoadError) {
      if (
        voterLoadError instanceof ApiError &&
        voterLoadError.status === 401
      ) {
        onUnauthorized()
      } else {
        setVoterError(errorMessage(voterLoadError))
      }
    } finally {
      setLoadingVoters(null)
    }
  }

  const totalVotes = Object.values(counts).reduce((sum, count) => sum + count, 0)
  const isOwner = poll.creator_id === currentUser.id

  return (
    <section className="detail-layout">
      <button type="button" className="back-button" onClick={onBack}>
        ← Back to polls
      </button>
      <div className="detail-header">
        <div>
          <p className="eyebrow">POLL DETAILS</p>
          <h1>{poll.title}</h1>
          <p className="detail-description">
            {poll.description || 'No description provided.'}
          </p>
        </div>
        {isOwner && (
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={onEdit}>
              Edit
            </button>
            <button type="button" className="danger-button" onClick={onDelete}>
              Delete
            </button>
          </div>
        )}
      </div>

      {error && <ErrorBanner message={error} />}
      {voterError && <ErrorBanner message={voterError} />}
      <div className="vote-summary">
        <strong>{totalVotes}</strong>
        <span className="muted">total votes</span>
        <span className="summary-divider" />
        <span className="muted">Select any option you like</span>
      </div>

      <div className="options-list">
        {poll.options.map((option) => {
          const count = counts[option.id] ?? 0
          const percentage = totalVotes ? Math.round((count / totalVotes) * 100) : 0
          const hasVoted = votedOptions.has(option.id)
          return (
            <article className="option-card" key={option.id}>
              <div className="option-main">
                <div className="option-info">
                  <h2>{option.text}</h2>
                  <div className="progress-track" aria-hidden="true">
                    <div className="progress-bar" style={{ width: `${percentage}%` }} />
                  </div>
                  <span className="muted">
                    {loadingCounts ? 'Loading votes…' : `${count} vote${count === 1 ? '' : 's'} · ${percentage}%`}
                  </span>
                </div>
                <button
                  type="button"
                  className={hasVoted ? 'voted-button' : 'primary-button'}
                  disabled={hasVoted || loadingVote !== null}
                  onClick={() => void handleVote(option.id)}
                >
                  {loadingVote === option.id
                    ? 'Voting…'
                    : hasVoted
                      ? 'Voted'
                      : 'Vote'}
                </button>
              </div>
              <button
                type="button"
                className="voters-toggle"
                onClick={() => void toggleVoters(option.id)}
              >
                {expandedOption === option.id ? 'Hide voters' : 'See voters'}{' '}
                <span aria-hidden="true">↓</span>
              </button>
              {expandedOption === option.id && (
                <div className="voters-panel">
                  {loadingVoters === option.id && <LoadingState label="Loading voters…" />}
                  {voters[option.id]?.length === 0 && (
                    <p className="muted">No one has voted for this option yet.</p>
                  )}
                  {voters[option.id]?.map((voter) => (
                    <div className="voter-row" key={voter.id}>
                      <span className="avatar">{voter.username.slice(0, 1).toUpperCase()}</span>
                      <span>
                        <strong>{voter.username}</strong>
                        <small>{voter.email}</small>
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </article>
          )
        })}
      </div>
    </section>
  )
}

type PollEditorProps = {
  poll: Poll | null
  currentUser: User
  onCancel: () => void
  onSaved: (poll: Poll) => void
  onUnauthorized: () => void
}

function PollEditor({
  poll,
  currentUser,
  onCancel,
  onSaved,
  onUnauthorized,
}: PollEditorProps) {
  const [title, setTitle] = useState(poll?.title ?? '')
  const [description, setDescription] = useState(poll?.description ?? '')
  const [options, setOptions] = useState(
    () =>
      poll?.options.map((option) => ({ id: option.id, text: option.text })) ?? [
        { id: 0, text: '' },
        { id: 0, text: '' },
      ],
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const isOwner = !poll || poll.creator_id === currentUser.id

  if (!isOwner) {
    return (
      <div className="state-card">
        <ErrorBanner message="Only the poll creator can edit this poll." />
        <button type="button" className="secondary-button" onClick={onCancel}>
          Go back
        </button>
      </div>
    )
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    const cleanTitle = title.trim()
    const cleanOptions = options.map((option) => ({
      id: option.id,
      text: option.text.trim(),
    }))
    if (!cleanTitle) {
      setError('A poll title is required.')
      return
    }
    if (cleanOptions.length < 2) {
      setError('Add at least two options.')
      return
    }
    if (cleanOptions.some((option) => !option.text)) {
      setError('Options cannot be empty.')
      return
    }

    setSaving(true)
    try {
      const savedPoll = poll
        ? await updatePoll(poll.id, {
            title: cleanTitle,
            description: description.trim(),
            options: cleanOptions,
          })
        : await createPoll({
            title: cleanTitle,
            description: description.trim(),
            options: cleanOptions.map((option) => option.text),
          })
      onSaved(savedPoll)
    } catch (saveError) {
      if (saveError instanceof ApiError && saveError.status === 401) {
        onUnauthorized()
      } else {
        setError(errorMessage(saveError))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="editor-layout">
      <button type="button" className="back-button" onClick={onCancel}>
        ← Cancel
      </button>
      <div className="editor-card">
        <p className="eyebrow">{poll ? 'EDIT POLL' : 'NEW POLL'}</p>
        <h1>{poll ? 'Shape your question' : 'Ask the room'}</h1>
        <p className="muted">
          Give people a clear question and at least two ways to answer.
        </p>
        {error && <ErrorBanner message={error} />}
        <form onSubmit={handleSubmit} className="stack-form">
          <label>
            Question
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="What should we do this weekend?"
              autoFocus
            />
          </label>
          <label>
            Description <span className="optional">(optional)</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a little context…"
              rows={3}
            />
          </label>
          <div className="options-editor">
            <div className="field-heading">
              <label>Options</label>
              <span className="muted">At least 2</span>
            </div>
            {options.map((option, index) => (
              <div
                className="option-input-row"
                key={option.id || `new-${index}`}
              >
                <input
                  value={option.text}
                  onChange={(event) =>
                    setOptions((previous) =>
                      previous.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, text: event.target.value }
                          : item,
                      ),
                    )
                  }
                  placeholder={`Option ${index + 1}`}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove option ${index + 1}`}
                  disabled={options.length <= 2}
                  onClick={() =>
                    setOptions((previous) =>
                      previous.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              className="text-button add-option"
              onClick={() =>
                setOptions((previous) => [...previous, { id: 0, text: '' }])
              }
            >
              ＋ Add another option
            </button>
          </div>
          <div className="button-row editor-actions">
            <button type="button" className="secondary-button" onClick={onCancel}>
              Cancel
            </button>
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? 'Saving…' : poll ? 'Save changes' : 'Publish poll'}
            </button>
          </div>
        </form>
      </div>
    </section>
  )
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <span aria-hidden="true">!</span>
      {message}
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="loading-state" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  )
}

export default App
