export interface AttachedFile {
    path: string;
    absolutePath: string;
    name: string;
    type: 'image' | 'document' | 'text';
}
export declare function parseFileArgs(args: string[]): {
    title?: string;
    files: AttachedFile[];
};
