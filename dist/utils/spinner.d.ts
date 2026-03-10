export declare class Spinner {
    private readonly frames;
    private interval;
    private frameIdx;
    private readonly message;
    constructor(message: string);
    start(): void;
    stop(finalMessage?: string): void;
}
