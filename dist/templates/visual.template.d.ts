export interface VisualResponse {
    title: string;
    summary: string;
    tags: string[];
    analysis: string;
    detectedConcepts: string[];
    relatedTerms: string[];
}
export declare function renderVisual(response: VisualResponse, existingVaultSlugs: string[], imageFileNames: string[], slug: string): string;
