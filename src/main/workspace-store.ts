import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import type {
  Citation,
  Entry,
  EntryDraft,
  EntryPosition,
  Project,
} from '../contracts/workspace';

export class WorkspaceStore {
  private readonly database: DatabaseSync;

  constructor(path: string) {
    this.database = new DatabaseSync(path);
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        document TEXT NOT NULL
      );
    `);
  }

  list(): Project[] {
    return this.database
      .prepare('SELECT document FROM projects')
      .all()
      .map((row) => JSON.parse(String(row.document)) as Project)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  get(id: string): Project {
    const row = this.database
      .prepare('SELECT document FROM projects WHERE id = ?')
      .get(id);
    if (!row) throw new Error('Learning space not found.');
    return JSON.parse(String(row.document)) as Project;
  }

  create(goal: string): Project {
    const trimmed = goal.trim();
    if (!trimmed) throw new Error('Enter a learning goal.');
    const now = new Date().toISOString();
    const project: Project = {
      id: randomUUID(),
      goal: trimmed,
      createdAt: now,
      updatedAt: now,
      entries: [],
    };
    this.persist(project);
    return project;
  }

  saveEntry(draft: EntryDraft): Project {
    const project = this.get(draft.projectId);
    const existing = draft.id
      ? project.entries.find((entry) => entry.id === draft.id)
      : undefined;
    if (draft.id && !existing) throw new Error('Note not found.');
    if (
      existing &&
      (existing.kind === 'assistant' || existing.kind === 'experiment')
    ) {
      throw new Error(
        'This entry keeps its original attribution. Create your own note instead.',
      );
    }
    const entry: Entry = existing ?? this.newEntry(project, draft.kind);
    Object.assign(entry, {
      title: draft.title,
      body: draft.body,
      url: draft.url,
      kind: draft.kind,
    });
    if (!existing) project.entries.push(entry);
    this.persist(project);
    return project;
  }

  moveEntry(position: EntryPosition): void {
    const project = this.get(position.projectId);
    const entry = project.entries.find((item) => item.id === position.id);
    if (!entry) throw new Error('Entry not found.');
    Object.assign(entry, { x: position.x, y: position.y });
    this.persist(project);
  }

  addAssistant(input: {
    projectId: string;
    prompt: string;
    body: string;
    citations: Citation[];
  }): Project {
    const project = this.get(input.projectId);
    const entry = this.newEntry(project, 'assistant');
    Object.assign(entry, {
      title: input.prompt,
      body: input.body,
      citations: input.citations,
    });
    project.entries.push(entry);
    this.persist(project);
    return project;
  }

  addExperiment(projectId: string): Project {
    const project = this.get(projectId);
    const entry = this.newEntry(project, 'experiment');
    Object.assign(entry, {
      title: 'See a matrix transform space',
      body: 'Predict what changes, adjust the matrix, and compare the result.',
    });
    project.entries.push(entry);
    this.persist(project);
    return project;
  }

  close(): void {
    this.database.close();
  }

  private newEntry(project: Project, kind: Entry['kind']): Entry {
    const index = project.entries.length;
    return {
      id: randomUUID(),
      kind,
      title: '',
      body: '',
      url: '',
      citations: [],
      x: 48 + (index % 2) * 424,
      y: 40 + Math.floor(index / 2) * 800,
      createdAt: new Date().toISOString(),
    };
  }

  private persist(project: Project): void {
    project.updatedAt = new Date().toISOString();
    this.database
      .prepare(
        'INSERT INTO projects (id, document) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET document = excluded.document',
      )
      .run(project.id, JSON.stringify(project));
  }
}
