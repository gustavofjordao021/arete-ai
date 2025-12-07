import { useState } from 'react';
import { ExternalLink, Trash2, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useIdentity, useMemory } from '@/hooks';
import { Button, Card, Switch, SectionHeader, Skeleton } from '@/components/ui';
import { LIMITS } from '@/lib/constants';

export default function App() {
  const { user, loading: authLoading, signIn, signOut } = useAuth();
  const { identity, formattedIdentity, loading: identityLoading, saveFromProse } = useIdentity();
  const { stats, facts, pages, loading: memoryLoading, refresh } = useMemory();

  const [prose, setProse] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSaveIdentity = async () => {
    if (!prose.trim()) {
      setSaveStatus({ type: 'error', message: 'Please enter something about yourself' });
      return;
    }

    setSaving(true);
    setSaveStatus(null);

    try {
      await saveFromProse(prose);
      setSaveStatus({ type: 'success', message: 'Identity saved!' });
      setProse('');
    } catch (err) {
      setSaveStatus({ type: 'error', message: err instanceof Error ? err.message : 'Failed to save' });
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    const data = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get(null, resolve);
    });

    const exportPayload = {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      source: 'chrome-extension',
      data,
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arete-export-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleClear = async () => {
    if (confirm('Clear all Arete memory? This cannot be undone.')) {
      await new Promise<void>((resolve) => {
        chrome.storage.local.clear(resolve);
      });
      refresh();
    }
  };

  return (
    <div className="min-h-screen bg-mesh text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/60 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between">
            {/* Logo + Title */}
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center">
                <span className="text-primary font-bold text-lg">A</span>
              </div>
              <div>
                <h1 className="text-xl font-semibold tracking-tight">Arete</h1>
                <p className="text-xs text-muted-foreground/80">Your AI, elevated</p>
              </div>
            </div>

            {/* User Section */}
            <div className="flex items-center gap-4">
              {authLoading ? (
                <Skeleton className="w-8 h-8 rounded-full" />
              ) : user ? (
                <div className="flex items-center gap-3">
                  <div className="text-right hidden sm:block">
                    <p className="text-sm font-medium">{user.email.split('@')[0]}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                  <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-medium">
                    {user.email.charAt(0).toUpperCase()}
                  </div>
                  <button
                    onClick={signOut}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <Button onClick={signIn} size="sm">Sign in</Button>
              )}
            </div>
          </div>
        </div>
        {/* Subtle gradient line */}
        <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Identity Section */}
          <section className="md:row-span-2 animate-fade-in-up flex flex-col">
            <SectionHeader number="01" label="identity" showDot className="mb-3" />
            <Card className="p-4 space-y-4 hover-lift card-atmospheric flex-1 flex flex-col">
              <textarea
                value={prose}
                onChange={(e) => setProse(e.target.value)}
                className="w-full h-32 p-3 text-sm textarea-refined"
                placeholder="Tell me about yourself... (e.g., I'm a Senior PM at PayNearMe working on payments and conversational AI)"
              />

              {/* Parsed identity preview */}
              <div className="rounded-lg bg-secondary/50 p-3 flex-1">
                <div className="text-xs text-muted-foreground mb-2">Current identity</div>
                {identityLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-line">{formattedIdentity}</p>
                )}
              </div>

              {saveStatus && (
                <p
                  className={cn(
                    'text-xs text-center',
                    saveStatus.type === 'success' ? 'text-primary' : 'text-destructive'
                  )}
                >
                  {saveStatus.message}
                </p>
              )}

              <Button className="w-full glow-primary" onClick={handleSaveIdentity} disabled={saving}>
                {saving ? 'Analyzing with AI...' : 'Save identity'}
              </Button>
            </Card>
          </section>

          {/* Memory Section */}
          <section className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
            <SectionHeader number="02" label="memory" showDot className="mb-3" />
            <Card className="p-4 space-y-3 hover-lift card-atmospheric">
              {/* Facts */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>Facts</span>
                  <span className="text-muted-foreground">
                    {stats.factsCount}/{LIMITS.maxFacts}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      stats.factsPercent >= 90
                        ? 'bg-destructive'
                        : stats.factsPercent >= 70
                        ? 'bg-amber-500'
                        : 'bg-primary'
                    )}
                    style={{ width: `${Math.min(stats.factsPercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Pages */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>Pages</span>
                  <span className="text-muted-foreground">
                    {stats.pagesCount}/{LIMITS.maxPages}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={cn(
                      'h-full rounded-full transition-all',
                      stats.pagesPercent >= 90
                        ? 'bg-destructive'
                        : stats.pagesPercent >= 70
                        ? 'bg-amber-500'
                        : 'bg-primary'
                    )}
                    style={{ width: `${Math.min(stats.pagesPercent, 100)}%` }}
                  />
                </div>
              </div>

              {/* Storage */}
              <div className="flex items-center justify-between pt-2 border-t border-border text-sm">
                <span className="text-muted-foreground">Storage</span>
                <span className="text-muted-foreground">{stats.storageKb} KB</span>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={handleClear}>
                  <Trash2 className="w-3 h-3 mr-1" />
                  Clear
                </Button>
                <Button variant="outline" size="sm" className="flex-1" onClick={handleExport}>
                  <Download className="w-3 h-3 mr-1" />
                  Export
                </Button>
              </div>
            </Card>
          </section>

          {/* Settings Section */}
          <section className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
            <SectionHeader number="03" label="settings" showDot className="mb-3" />
            <Card className="p-4 space-y-4 hover-lift card-atmospheric">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">Sync to cloud</span>
                  <p className="text-xs text-muted-foreground">
                    {user ? 'Enabled' : 'Sign in to enable'}
                  </p>
                </div>
                <Switch checked={!!user} disabled={!user} aria-label="Sync to cloud" />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm">Auto-capture context</span>
                  <p className="text-xs text-muted-foreground">Record page visits</p>
                </div>
                <Switch defaultChecked aria-label="Auto-capture context" />
              </div>

              <div className="pt-3 border-t border-border/50">
                <label className="label-refined">Default model</label>
                <select className="w-full p-2.5 text-sm select-refined">
                  <option>Claude</option>
                  <option>GPT-4</option>
                </select>
              </div>
            </Card>
          </section>

          {/* Recent Context Section */}
          <section className="md:col-span-2 animate-fade-in-up" style={{ animationDelay: '150ms' }}>
            <SectionHeader number="04" label="recent context" showDot className="mb-3" />
            <Card className="p-4 hover-lift card-atmospheric">
              {pages.length === 0 ? (
                <p className="text-sm text-muted-foreground italic text-center py-4">
                  No recent context. Browse the web to build your context.
                </p>
              ) : (
                <div className="divide-y divide-border">
                  {pages.slice(0, 10).map((page, i) => (
                    <div key={i} className="py-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{page.title || page.url}</p>
                        <p className="text-xs text-muted-foreground truncate">{page.url}</p>
                      </div>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          {/* Learned Facts Section */}
          {facts.length > 0 && (
            <section className="md:col-span-2 animate-fade-in-up" style={{ animationDelay: '200ms' }}>
              <SectionHeader number="05" label="learned facts" showDot className="mb-3" />
              <Card className="p-4 hover-lift card-atmospheric">
                <div className="divide-y divide-border">
                  {facts.slice(-10).reverse().map((fact, i) => (
                    <div key={i} className="py-2">
                      <p className="text-sm">{fact.fact}</p>
                    </div>
                  ))}
                </div>
              </Card>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
