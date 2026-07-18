export type ProjectRecord = {
  version: 1;
  id: string;
  name: string;
  color: string;
  order: number;
  archivedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
