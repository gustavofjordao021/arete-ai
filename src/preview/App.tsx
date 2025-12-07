import { useState } from 'react';
import { Settings, ExternalLink, Sparkles, Brain, Globe } from 'lucide-react';

type Variant = 'current' | 'serif' | 'atmospheric' | 'combined';

export default function App() {
  const [variant, setVariant] = useState<Variant>('combined');

  const useSerif = variant === 'serif' || variant === 'combined';
  const useAtmospheric = variant === 'atmospheric' || variant === 'combined';

  return (
    <div
      className={`min-h-screen transition-theme ${
        useAtmospheric ? 'bg-mesh noise-overlay relative' : 'bg-background'
      }`}
    >
      {/* Variant Switcher */}
      <div className="preview-switcher">
        <button
          onClick={() => setVariant('current')}
          className={variant === 'current' ? 'active' : ''}
        >
          Current
        </button>
        <button
          onClick={() => setVariant('serif')}
          className={variant === 'serif' ? 'active' : ''}
        >
          A: Serif
        </button>
        <button
          onClick={() => setVariant('atmospheric')}
          className={variant === 'atmospheric' ? 'active' : ''}
        >
          C: Atmospheric
        </button>
        <button
          onClick={() => setVariant('combined')}
          className={variant === 'combined' ? 'active' : ''}
        >
          A+C Combined
        </button>
      </div>

      {/* Header */}
      <header className="border-b border-border/50">
        <div className="max-w-6xl mx-auto px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg">
              A
            </div>
            <div>
              <h1 className={`text-lg font-semibold ${useSerif ? 'font-serif' : ''}`}>
                Arete
              </h1>
              <p className="text-xs text-muted-foreground">Your AI, elevated</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-medium">
              G
            </div>
            <button className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-8 py-16">
        <div className="flex items-start gap-2 mb-4">
          <span className="marker-dot" />
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Portable Identity
          </span>
        </div>
        <h2
          className={`headline-xl mb-6 ${
            useSerif ? 'font-serif' : 'font-sans'
          } text-foreground`}
        >
          Your AI knows
          <br />
          <span className="text-primary">who you are</span>
        </h2>
        <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
          Carry your identity across every AI interaction. Context that follows you,
          conversations that remember.
        </p>
      </section>

      <div className="divider-line max-w-6xl mx-auto" />

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-8 py-16">
        <div className="flex items-start gap-2 mb-8">
          <span className="marker-dot" />
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            Core Features
          </span>
        </div>
        <div className="feature-grid">
          <FeatureCard
            icon={<Brain className="w-5 h-5" />}
            title="Identity Sync"
            description="Your role, expertise, and preferences travel with you"
            useSerif={useSerif}
            useAtmospheric={useAtmospheric}
          />
          <FeatureCard
            icon={<Globe className="w-5 h-5" />}
            title="Context Aware"
            description="Browsing history and page context inform every response"
            useSerif={useSerif}
            useAtmospheric={useAtmospheric}
          />
          <FeatureCard
            icon={<Sparkles className="w-5 h-5" />}
            title="Multi-Model"
            description="Claude, GPT, and more — same identity, any model"
            useSerif={useSerif}
            useAtmospheric={useAtmospheric}
          />
        </div>
      </section>

      <div className="divider-line max-w-6xl mx-auto" />

      {/* Settings Preview */}
      <section className="max-w-6xl mx-auto px-8 py-16">
        <div className="grid grid-cols-2 gap-12">
          {/* Identity Card */}
          <div>
            <div className="flex items-start gap-2 mb-4">
              <span className="marker-dot" />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                01 Identity
              </span>
            </div>
            <div
              className={`rounded-xl p-6 ${
                useAtmospheric
                  ? 'bg-atmospheric-card'
                  : 'bg-card border border-border'
              }`}
            >
              <h3
                className={`text-xl mb-4 ${
                  useSerif ? 'font-serif' : 'font-semibold'
                }`}
              >
                Current Identity
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Role</span>
                  <span>Senior PM at PayNearMe</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Background</span>
                  <span>Payments + conversational AI</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expertise</span>
                  <span>Product, AI integration</span>
                </div>
              </div>
              <button className="mt-6 w-full py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                Edit identity
              </button>
            </div>
          </div>

          {/* Memory Card */}
          <div>
            <div className="flex items-start gap-2 mb-4">
              <span className="marker-dot" />
              <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                02 Memory
              </span>
            </div>
            <div
              className={`rounded-xl p-6 ${
                useAtmospheric
                  ? 'bg-atmospheric-card'
                  : 'bg-card border border-border'
              }`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3
                  className={`text-xl ${
                    useSerif ? 'font-serif' : 'font-semibold'
                  }`}
                >
                  Storage
                </h3>
                <span className="text-sm text-muted-foreground">10.3 KB</span>
              </div>
              <div className="space-y-4">
                <ProgressRow label="Facts" value={0} max={50} />
                <ProgressRow label="Pages" value={15} max={20} />
                <ProgressRow label="Messages" value={0} max={100} />
              </div>
              <div className="flex gap-3 mt-6">
                <button className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors">
                  Clear
                </button>
                <button className="flex-1 py-2.5 rounded-lg bg-secondary text-secondary-foreground text-sm font-medium hover:bg-secondary/80 transition-colors">
                  Export
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="divider-line max-w-6xl mx-auto" />

      {/* Recent Context */}
      <section className="max-w-6xl mx-auto px-8 py-16">
        <div className="flex items-start gap-2 mb-6">
          <span className="marker-dot" />
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            03 Recent Context
          </span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { title: 'Hacker News', url: 'news.ycombinator.com', time: '2 min ago' },
            { title: 'Giga - Voice AI', url: 'giga.ai', time: '15 min ago' },
            { title: 'Linear - Issues', url: 'linear.app', time: '1 hour ago' },
          ].map((page, i) => (
            <div
              key={i}
              className={`rounded-lg p-4 group cursor-pointer transition-all hover:-translate-y-0.5 ${
                useAtmospheric
                  ? 'bg-atmospheric-card hover:border-primary/50'
                  : 'bg-card border border-border hover:border-primary/50'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-sm mb-1">{page.title}</h4>
                  <p className="text-xs text-muted-foreground">{page.url}</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <p className="text-xs text-muted-foreground mt-2">{page.time}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/50 mt-8">
        <div className="max-w-6xl mx-auto px-8 py-6 flex items-center justify-between text-sm text-muted-foreground">
          <span>Arete v0.1.0</span>
          <span>Design Preview</span>
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  useSerif,
  useAtmospheric,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  useSerif: boolean;
  useAtmospheric: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-6 transition-all hover:-translate-y-1 ${
        useAtmospheric
          ? 'bg-atmospheric-card'
          : 'bg-card border border-border'
      }`}
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className={`text-lg mb-2 ${useSerif ? 'font-serif' : 'font-semibold'}`}>
        {title}
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const percentage = (value / max) * 100;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-muted-foreground">{label}</span>
        <span>
          {value}/{max}
        </span>
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
