import { useState } from 'react'
import { HomeScreen } from './screens/HomeScreen'
import { AddScreen } from './screens/AddScreen'
import { ReviewScreen } from './screens/ReviewScreen'
import { WordListScreen } from './screens/WordListScreen'
import { ManageScreen } from './screens/ManageScreen'
import { TabIcon } from './components/TabIcon'

type Tab = 'home' | 'list' | 'add' | 'manage'

export default function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [reviewing, setReviewing] = useState(false)
  // key bump forces a screen to re-read from the DB when we navigate to it
  const [nonce, setNonce] = useState(0)
  const refresh = () => setNonce((n) => n + 1)

  const go = (t: Tab) => {
    setTab(t)
    refresh()
  }

  // Review is a full-screen flow launched from Home, not a tab.
  if (reviewing) {
    return (
      <div className="app">
        <div className="statusbar-fill" aria-hidden="true" />
        <ReviewScreen
          onDone={() => {
            setReviewing(false)
            refresh()
          }}
        />
      </div>
    )
  }

  return (
    <div className="app with-tabs">
      <div className="statusbar-fill" aria-hidden="true" />
      <main className="tab-body">
        {tab === 'home' && (
          <HomeScreen key={nonce} onReview={() => setReviewing(true)} onAdd={() => go('add')} />
        )}
        {tab === 'list' && <WordListScreen key={nonce} />}
        {tab === 'add' && <AddScreen key={nonce} onDone={() => go('home')} />}
        {tab === 'manage' && <ManageScreen key={nonce} />}
      </main>

      <nav className="tabbar">
        <button className={tab === 'home' ? 'on' : ''} onClick={() => go('home')}>
          <TabIcon name="home" />首頁
        </button>
        <button className={tab === 'list' ? 'on' : ''} onClick={() => go('list')}>
          <TabIcon name="list" />單字
        </button>
        <button className={tab === 'add' ? 'on' : ''} onClick={() => go('add')}>
          <TabIcon name="add" />新增
        </button>
        <button className={tab === 'manage' ? 'on' : ''} onClick={() => go('manage')}>
          <TabIcon name="manage" />資料
        </button>
      </nav>
    </div>
  )
}
