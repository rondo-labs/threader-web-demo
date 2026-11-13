// The site's top bar: the wordmark goes home (the Q&A); the three sections sit on the right.
export function Nav({ active }: { active?: 'home' | 'teams' | 'players' | 'review' }) {
  const items = [
    { key: 'teams', label: '球队', href: '/teams/' },
    { key: 'players', label: '球员', href: '/players/' },
    { key: 'review', label: '复盘', href: '/review/' },
  ]
  return (
    <header className="site-nav">
      <a href="/" className="site-mark" aria-current={active === 'home'}>THREADER</a>
      <nav aria-label="栏目">
        {items.map((it) => (
          <a key={it.key} href={it.href} aria-current={active === it.key}>{it.label}</a>
        ))}
      </nav>
    </header>
  )
}
