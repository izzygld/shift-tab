export type Mode = 'keyboard' | 'screen-reader' | 'pointer';

export interface FixOption {
  id: string;
  label: string;
  replace: string;
  correct: boolean;
  feedback: string;
}

export interface FixGroup {
  id: string;
  title: string;
  find: string;
  options: FixOption[];
}

export interface WcagRef {
  id: string;
  name: string;
  url: string;
}

export interface LevelData {
  id: string;
  order: number;
  title: string;
  wcag: WcagRef[];
  modes: Mode[];
  issue: {
    number: number;
    title: string;
    reporter: { name: string; uses: string };
    body: string[];
  };
  task: {
    instruction: string;
    goalSelector?: string;
    goalKey?: string;
    afterReproduce: string;
  };
  fixes: FixGroup[];
  checks: {
    axe: string[];
    custom: string[];
  };
  merged: {
    reply: string;
    learn: string[];
  };
}

export interface Level extends LevelData {
  page: string;
}
