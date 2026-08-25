import { useCallback, useEffect, useState } from 'react'
import './App.css'
import {
  ApiError,
  clearStoredSession,
  createPoll,
  deletePoll,
  getMyVotes,
  getPollCounts,
  getStoredSession,
  getVoters,
  listPolls,
  login,
  removeVote,
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
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'name' | 'author'>('name')
  const [onlyUnvoted, setOnlyUnvoted] = useState(false)

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

  const normalizedQuery = searchQuery.trim().toLowerCase()
  const visiblePolls = polls.filter((poll) => {
    const searchTarget =
      searchMode === 'name' ? poll.title : poll.creator_username
    const matchesQuery =
      !normalizedQuery || searchTarget.toLowerCase().includes(normalizedQuery)
    return matchesQuery && (!onlyUnvoted || !poll.has_voted)
  })

  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DISCOVER</p>
          <h1>All polls</h1>
          <p className="muted">Ask a question. Start a conversation.</p>
        </div>
        <div className="page-heading-actions">
          <button
            type="button"
            className="search-toggle"
            aria-label={searchOpen ? 'Close poll search' : 'Search polls'}
            aria-expanded={searchOpen}
            onClick={() => setSearchOpen((open) => !open)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.3" />
              <path d="m16 16 4.5 4.5" />
            </svg>
          </button>
          <button type="button" className="primary-button" onClick={onCreate}>
            <span aria-hidden="true">＋</span> Create poll
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="search-panel">
          <label className="search-field">
            <span className="visually-hidden">Search polls</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="10.8" cy="10.8" r="6.3" />
              <path d="m16 16 4.5 4.5" />
            </svg>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={
                searchMode === 'name'
                  ? 'Search by poll name…'
                  : 'Search by author…'
              }
              autoFocus
            />
          </label>
          <label className="search-select">
            <span>Search by</span>
            <select
              value={searchMode}
              onChange={(event) =>
                setSearchMode(event.target.value as 'name' | 'author')
              }
            >
              <option value="name">Poll name</option>
              <option value="author">Author</option>
            </select>
          </label>
          <label className="search-filter">
            <input
              type="checkbox"
              checked={onlyUnvoted}
              onChange={(event) => setOnlyUnvoted(event.target.checked)}
            />
            Not voted yet
          </label>
          {(searchQuery || onlyUnvoted) && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                setSearchQuery('')
                setOnlyUnvoted(false)
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}

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
      {!loading && !error && polls.length > 0 && visiblePolls.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">⌕</div>
          <h2>No matching polls</h2>
          <p className="muted">Try another search or clear your filters.</p>
        </div>
      )}
      {!loading && !error && visiblePolls.length > 0 && (
        <div className="poll-grid">
          {visiblePolls.map((poll) => (
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
              <p className="poll-author">
                By {poll.creator_username || 'Unknown author'}
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
  const [resultsRevealed, setResultsRevealed] = useState(false)
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
      setResultsRevealed(true)
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
    async function loadVotingState() {
      try {
        const nextVotedOptions = await getMyVotes(poll.id)
        if (!active) {
          return
        }
        setVotedOptions(new Set(nextVotedOptions))
        if (nextVotedOptions.length > 0) {
          const nextCounts = await getPollCounts(poll.id)
          if (!active) {
            return
          }
          setCounts(
            Object.fromEntries(
              nextCounts.map((item: VoteCount) => [
                item.option_id,
                item.count,
              ]),
            ),
          )
          setResultsRevealed(true)
        }
      } catch (loadError: unknown) {
        if (!active) {
          return
        }
        if (loadError instanceof ApiError && loadError.status === 401) {
          onUnauthorized()
        } else {
          setError(errorMessage(loadError))
        }
      } finally {
        if (active) {
          setLoadingCounts(false)
        }
      }
    }
    void loadVotingState()
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

  async function handleUnvote(optionID: number) {
    setError('')
    setLoadingVote(optionID)
    try {
      await removeVote(poll.id, optionID)
      setVotedOptions((previous) => {
        const next = new Set(previous)
        next.delete(optionID)
        return next
      })
      setCounts((previous) => ({
        ...previous,
        [optionID]: Math.max((previous[optionID] ?? 0) - 1, 0),
      }))
      setVoters((previous) => {
        const optionVoters = previous[optionID]
        if (!optionVoters) {
          return previous
        }
        return {
          ...previous,
          [optionID]: optionVoters.filter((voter) => voter.id !== currentUser.id),
        }
      })
    } catch (unvoteError) {
      if (unvoteError instanceof ApiError && unvoteError.status === 401) {
        onUnauthorized()
      } else {
        setError(errorMessage(unvoteError))
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
  const expandedVoterOption = poll.options.find(
    (option) => option.id === expandedOption,
  )

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
      <div className="vote-summary">
        {loadingCounts ? (
          <span className="muted">Checking your voting status…</span>
        ) : resultsRevealed ? (
          <>
            <strong>{totalVotes}</strong>
            <span className="muted">total votes</span>
            <span className="summary-divider" />
            <span className="muted">Select any option you like</span>
          </>
        ) : (
          <span className="muted">Vote once to reveal the results.</span>
        )}
      </div>

      {resultsRevealed && !loadingCounts && (
        <VoteDistribution
          options={poll.options}
          counts={counts}
          totalVotes={totalVotes}
        />
      )}

      <div className="options-list">
        {poll.options.map((option) => {
          const count = counts[option.id] ?? 0
          const percentage = resultsRevealed && totalVotes
            ? (count / totalVotes) * 100
            : 0
          const hasVoted = votedOptions.has(option.id)
          return (
            <article className="option-card" key={option.id}>
              <div className="option-main">
                <div className="option-info">
                  <div className="option-heading-row">
                    <h2>{option.text}</h2>
                    <strong className="option-vote-count">
                      {loadingCounts
                        ? 'Checking…'
                        : resultsRevealed
                          ? `${count} vote${count === 1 ? '' : 's'}`
                          : 'Results hidden'}
                    </strong>
                  </div>
                  <div className="progress-track" aria-hidden="true">
                    <div className="progress-bar" style={{ width: `${percentage}%` }} />
                  </div>
                </div>
                <button
                  type="button"
                  className={hasVoted ? 'voted-button' : 'primary-button'}
                  disabled={loadingVote !== null || loadingCounts}
                  onClick={() =>
                    void (hasVoted
                      ? handleUnvote(option.id)
                      : handleVote(option.id))
                  }
                >
                  {loadingVote === option.id
                    ? hasVoted
                      ? 'Removing…'
                      : 'Voting…'
                    : hasVoted
                      ? 'Unvote'
                      : 'Vote'}
                </button>
              </div>
              {resultsRevealed && (
                <button
                  type="button"
                  className="voters-toggle"
                  onClick={() => void toggleVoters(option.id)}
                >
                  {expandedOption === option.id ? 'Hide voters' : 'See voters'}{' '}
                  <span aria-hidden="true">↓</span>
                </button>
              )}
            </article>
          )
        })}
      </div>
      {expandedVoterOption && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setExpandedOption(null)}
        >
          <section
            className="voters-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="voters-modal-heading"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <div>
                <p className="eyebrow">VOTERS</p>
                <h2 id="voters-modal-heading">{expandedVoterOption.text}</h2>
              </div>
              <button
                type="button"
                className="modal-close-button"
                onClick={() => setExpandedOption(null)}
              >
                Cancel
              </button>
            </div>
            <div className="voters-modal-list">
              {voterError && <ErrorBanner message={voterError} />}
              {loadingVoters === expandedVoterOption.id && (
                <LoadingState label="Loading voters…" />
              )}
              {voters[expandedVoterOption.id]?.length === 0 && (
                <p className="muted">No one has voted for this option yet.</p>
              )}
              {voters[expandedVoterOption.id]?.map((voter) => (
                <div className="voter-row" key={voter.id}>
                  <span className="avatar">
                    {voter.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{voter.username}</strong>
                    <small>{voter.email}</small>
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </section>
  )
}

type VoteDistributionProps = {
  options: Poll['options']
  counts: Record<number, number>
  totalVotes: number
}

function VoteDistribution({
  options,
  counts,
  totalVotes,
}: VoteDistributionProps) {
  const colors = ['#1d7a4b', '#e3a53b', '#4f8fc0', '#b86ca8', '#d46b4d', '#6877b5']
  const percentageFor = (optionID: number) =>
    totalVotes ? ((counts[optionID] ?? 0) / totalVotes) * 100 : 0
  const segments = options.map((option, index) => {
    const percentage = percentageFor(option.id)
    const start = options
      .slice(0, index)
      .reduce((sum, previous) => sum + percentageFor(previous.id), 0)
    const segment = `${colors[index % colors.length]} ${start}% ${start + percentage}%`
    return { option, segment, color: colors[index % colors.length] }
  })

  return (
    <section className="distribution-card" aria-labelledby="distribution-heading">
      <div>
        <p className="eyebrow">RESULTS</p>
        <h2 id="distribution-heading">Vote distribution</h2>
        <p className="muted">Here’s how the room is leaning.</p>
      </div>
      <div className="distribution-content">
        <div
          className="pie-chart"
          role="img"
          aria-label={`Vote distribution across ${options.length} options`}
          style={{
            background: totalVotes
              ? `conic-gradient(${segments.map((segment) => segment.segment).join(', ')})`
              : 'var(--surface-soft)',
          }}
        >
          <div className="pie-chart-center">
            <strong>{totalVotes}</strong>
            <span>votes</span>
          </div>
        </div>
        <div className="distribution-legend">
          {segments.map(({ option, color }) => (
            <div className="legend-item" key={option.id}>
              <span className="legend-swatch" style={{ background: color }} />
              <span className="legend-label">{option.text}</span>
            </div>
          ))}
        </div>
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
