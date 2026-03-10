export interface TermSummary {
  term: string;
  category: string;
  tags: string[];
  summary: string;
  relatedTerms: string[];
}

export interface TermExample {
  title: string;
  code?: string;
  description: string;
}

export interface TermData {
  term: string;
  turkishEquivalent: string;
  category: string;
  tags: string[];
  summary: string;
  explanation: string;
  examples: TermExample[];
  relatedTerms: string[];
  commonMistakes: string[];
  sources: string[];
}
