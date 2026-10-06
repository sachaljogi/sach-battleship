const ITEMS = [
  { symbol: '', label: 'Untried water (blank)' },
  { symbol: '■', label: 'Your ship' },
  { symbol: '•', label: 'Miss' },
  { symbol: '✕', label: 'Hit' },
  { symbol: '✖', label: 'Sunk ship' },
  { symbol: '◇', label: 'Revealed unhit ship' },
]

export default function Legend() {
  return (
    <section className="legend" aria-label="Board legend">
      <h3>Legend</h3>
      <ul>
        {ITEMS.map(({ symbol, label }) => (
          <li key={label}>
            <span className="legend-symbol" aria-hidden="true">{symbol || 'Blank'}</span>
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
