'use client';
import { useState } from 'react';
import dynamic from 'next/dynamic';

// v10 Admin → "Game settings": one tab per game. Only the open tab's panels are loaded (lazy chunks).
const Lazy = () => <section className="panel" aria-busy="true" style={{ minHeight: 80 }} />;
const OddsPanel = dynamic(() => import('./OddsPanel'), { ssr: false, loading: Lazy });
const SurpriseRatePanel = dynamic(() => import('./SurpriseRatePanel'), { ssr: false, loading: Lazy });
const BankPanel = dynamic(() => import('./BankPanel'), { ssr: false, loading: Lazy });
const DrinksEditor = dynamic(() => import('../DrinksEditor'), { ssr: false, loading: Lazy });
const SurpriseEditor = dynamic(() => import('../SurpriseEditor'), { ssr: false, loading: Lazy });
const RaceSettingsPanel = dynamic(() => import('./RaceSettingsPanel'), { ssr: false, loading: Lazy });
const RaceSpeedEditor = dynamic(() => import('../RaceSpeedEditor'), { ssr: false, loading: Lazy });

const TABS = [['tod', '🎭 Truth or Dare'], ['race', '🏁 Animal Race']];

export default function GameSettings() {
  const [tab, setTab] = useState('tod');
  return (
    <section className="game-settings" data-section="game-settings">
      <h2 style={{ margin: '22px 0 8px' }}>🎮 Game settings</h2>
      <div className="tabs gs-tabs" role="tablist">
        {TABS.map(([id, name]) => <button key={id} role="tab" aria-selected={tab === id} aria-pressed={tab === id} data-gs-tab={id} onClick={() => setTab(id)}>{name}</button>)}
      </div>
      {tab === 'tod' ? (
        <div data-gs-panel="tod">
          <p className="count">Chicken-out drink odds and the petted-animal rule, how often surprise cards appear, and the drink options.</p>
          <OddsPanel />
          <SurpriseRatePanel />
          <section className="panel" id="drinks"><DrinksEditor /></section>
          <SurpriseEditor speeds={false} />
          <BankPanel />
        </div>
      ) : (
        <div data-gs-panel="race">
          <p className="count">Hunter timing, shot damage and the penalty, plus each animal’s running speed.</p>
          <RaceSettingsPanel />
          <RaceSpeedEditor open />
        </div>
      )}
    </section>
  );
}
