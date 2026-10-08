import {
  nextRank,
  rankOf,
  recentGames,
  winRate,
  type SessionStats,
} from '../game/stats'
import { winnerLabel } from '../ui/messages'

interface LeaderboardProps {
  stats: SessionStats
  rankUp: string | null
  compact?: boolean
}

export default function Leaderboard({ stats, rankUp, compact = false }: LeaderboardProps) {
  const rank = rankOf(stats)
  const next = nextRank(stats)
  const games = recentGames(stats)

  return (
    <section
      className={`leaderboard${compact ? ' leaderboard-compact' : ''}`}
      aria-labelledby="leaderboard-heading"
      data-testid="leaderboard"
    >
      <h2 id="leaderboard-heading">Session leaderboard</h2>
      <dl className="leaderboard-summary">
        <div>
          <dt>Rank</dt>
          <dd>{rank}</dd>
        </div>
        <div>
          <dt>Record (W–L)</dt>
          <dd>{stats.wins}–{stats.losses}</dd>
        </div>
        <div>
          <dt>Win streak</dt>
          <dd>{stats.streak}</dd>
        </div>
        {!compact && (
          <>
            <div>
              <dt>Win rate</dt>
              <dd>{stats.gamesPlayed === 0 ? '—' : `${Math.round(winRate(stats) * 100)}%`}</dd>
            </div>
            <div>
              <dt>Best win</dt>
              <dd>{stats.bestWinShots === null ? '—' : `${stats.bestWinShots} shots`}</dd>
            </div>
          </>
        )}
      </dl>
      {!compact && (
        <>
          {rankUp && <p className="rank-up">{rankUp}</p>}
          <p className="next-rank">
            {next
              ? `${next.winsNeeded} more ${next.winsNeeded === 1 ? 'win' : 'wins'} to reach ${next.rank}.`
              : 'You hold the highest rank.'}
          </p>
          {games.length === 0
            ? <p>No games finished yet this session.</p>
            : (
              <table className="recent-games">
                <caption>Most recent games</caption>
                <thead>
                  <tr>
                    <th scope="col">Game</th>
                    <th scope="col">Winner</th>
                    <th scope="col">Your shots</th>
                    <th scope="col">AI shots</th>
                  </tr>
                </thead>
                <tbody>
                  {games.map((game) => (
                    <tr key={game.game}>
                      <th scope="row">{game.game}</th>
                      <td>{winnerLabel(game.winner)}</td>
                      <td>{game.playerShots}</td>
                      <td>{game.aiShots}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </>
      )}
    </section>
  )
}
