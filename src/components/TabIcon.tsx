// Clean outline (line) icons for the tab bar. Stroke uses currentColor so the
// active-tab color applies automatically. 24×24 viewBox, 1.8 stroke.
type IconName = 'home' | 'list' | 'add' | 'manage'

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  list: 'M4 5h13M4 10h13M4 15h9M20 5v14M20 5l-2 2M20 5l2 2',
  add: 'M12 5v14M5 12h14',
  manage: 'M3 7l1.5-2.5A1 1 0 0 1 5.4 4h13.2a1 1 0 0 1 .9.5L21 7M3 7h18M3 7v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V7M9.5 11h5'
}

export function TabIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="ti-svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === 'list' ? (
        // book: two spreads + spine, drawn as separate strokes
        <>
          <path d="M12 6c-1.5-1-4-1.5-6-1.5S3 5 3 5v13s1-.5 3-.5 4.5.5 6 1.5" />
          <path d="M12 6c1.5-1 4-1.5 6-1.5S21 5 21 5v13s-1-.5-3-.5-4.5.5-6 1.5" />
          <path d="M12 6v13" />
        </>
      ) : name === 'add' ? (
        // plus inside a rounded square for a clearer "add" affordance
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
          <path d="M12 8.5v7M8.5 12h7" />
        </>
      ) : (
        <path d={P[name]} />
      )}
    </svg>
  )
}
