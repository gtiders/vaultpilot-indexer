export type IndexEventType = "create" | "modify" | "rename" | "delete";

export interface IndexEvent {
  type: IndexEventType;
  noteId: string;
  path: string;
  oldPath?: string;
  timestamp: number;
}
