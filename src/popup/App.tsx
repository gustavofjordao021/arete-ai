import { Settings, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth, useIdentity, useMemory } from '@/hooks';
import { Button, Card, Switch, SectionHeader, Skeleton } from '@/components/ui';
import { LIMITS } from '@/lib/constants';

export default function App() {
  const { user, loading: authLoading, signIn, signOut } = useAuth();
  const { formattedIdentity, loading: identityLoading } = useIdentity();
  const { stats, loading: memoryLoading } = useMemory();

  const loading = authLoading || identityLoading || memoryLoading;

  const openOptions = () => {
    chrome.runtime.openOptionsPage();
  };

  return (
    <div className="w-[320px] min-h-[200px] bg-mesh-popup text-foreground">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">
            A
          </div>
          <span className="font-semibold text-sm">Arete</span>
        </div>
        <div className="flex items-center gap-2">
          {authLoading ? (
            <div className="w-6 h-6 rounded-full bg-muted animate-pulse" />
          ) : user ? (
            <button
              onClick={signOut}
              className="flex items-center gap-1.5 hover:opacity-80"
              title={`Signed in as ${user.email}. Click to sign out.`}
            >
              <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-medium">
                {user.email.charAt(0).toUpperCase()}
              </div>
            </button>
          ) : (
            <button
              onClick={signIn}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign in
            </button>
          )}
          <button
            onClick={openOptions}
            className="p-1 rounded hover:bg-secondary transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="p-4 space-y-4">
        {/* Identity Section */}
        <section className="animate-fade-in-up">
          <SectionHeader label="identity" showDot className="mb-2" />
          <Card className="p-3 hover-lift card-atmospheric">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm whitespace-pre-line">
                  {formattedIdentity.split('\n').slice(0, 3).join('\n')}
                </p>
                <button
                  onClick={openOptions}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Edit identity
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}
          </Card>
        </section>

        {/* Memory Stats */}
        <section className="animate-fade-in-up" style={{ animationDelay: '50ms' }}>
          <SectionHeader
            label="memory"
            showDot
            action={
              <span className="text-xs text-muted-foreground">
                {stats.storageKb} KB
              </span>
            }
            className="mb-2"
          />
          <Card className="p-3 space-y-3 hover-lift card-atmospheric">
            {/* Facts */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Facts</span>
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
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Pages</span>
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

            {/* Messages count */}
            <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
              <span className="text-muted-foreground">Messages</span>
              <span className="text-muted-foreground">{stats.messagesCount}</span>
            </div>
          </Card>
        </section>

        {/* Quick Settings */}
        <section className="animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <SectionHeader label="quick settings" showDot className="mb-2" />
          <Card className="p-3 space-y-3 hover-lift card-atmospheric">
            <div className="flex items-center justify-between">
              <span className="text-sm">Sync to cloud</span>
              <Switch
                checked={!!user}
                disabled={!user}
                aria-label="Sync to cloud"
              />
            </div>
          </Card>
        </section>

        {/* Footer */}
        <Button
          variant="outline"
          className="w-full"
          onClick={openOptions}
        >
          Open full settings
          <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </main>
    </div>
  );
}
