import { useRef, type ComponentType, type ReactNode } from 'react';
import { BookOpen, SlidersHorizontal, Sparkles } from 'lucide-react';

interface TabDefinition {
  id: string;
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
}

const TABS: readonly TabDefinition[] = [
  { id: 'plan', label: 'AI Daily Plan', icon: Sparkles },
  { id: 'impact', label: 'Impact Lab', icon: SlidersHorizontal },
  { id: 'playbook', label: 'Playbook & Local HF', icon: BookOpen }
];

function resolveNextTabIndex(current: number, key: string): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return TABS.length - 1;
  if (key === 'ArrowRight') return (current + 1) % TABS.length;
  if (key === 'ArrowLeft') return (current + TABS.length - 1) % TABS.length;
  return null;
}

interface WorkspaceTabsProps {
  tabIndex: number;
  onSelectTab: (index: number) => void;
  panels: readonly [ReactNode, ReactNode, ReactNode];
}

/** Accessible ARIA tablist and roving-tabindex panel switcher for the three core tools. */
export function WorkspaceTabs({ tabIndex, onSelectTab, panels }: WorkspaceTabsProps) {
  const tabButtons = useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <section className="workspace" aria-label="Air quality workspace">
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="Air quality tools"
        data-active-tab={tabIndex}
      >
        <span className="tab-indicator" aria-hidden="true" />
        {TABS.map(({ id, label, icon: Icon }, index) => (
          <button
            type="button"
            id={'tab-' + id}
            key={id}
            role="tab"
            ref={(button) => {
              tabButtons.current[index] = button;
            }}
            aria-selected={tabIndex === index}
            aria-controls={'panel-' + id}
            tabIndex={tabIndex === index ? 0 : -1}
            onClick={() => onSelectTab(index)}
            onKeyDown={(event) => {
              const next = resolveNextTabIndex(index, event.key);
              if (next === null) return;
              event.preventDefault();
              onSelectTab(next);
              tabButtons.current[next]?.focus();
            }}
          >
            <Icon size={17} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>
      {TABS.map(({ id }, index) => (
        <div
          id={'panel-' + id}
          key={id}
          role="tabpanel"
          aria-labelledby={'tab-' + id}
          className="workspace-panel"
          tabIndex={0}
          hidden={tabIndex !== index}
        >
          {panels[index]}
        </div>
      ))}
    </section>
  );
}
