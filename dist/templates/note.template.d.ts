export interface NoteResponse {
    title: string;
    summary: string;
    tags: string[];
    content: string;
    keyPoints: string[];
    relatedTerms: string[];
}
export declare function renderNote(response: NoteResponse, existingVaultSlugs: string[], sources: string[], slug: string): string;
