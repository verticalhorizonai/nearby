// Copies the schema files the server applies at start next to the compiled runner (spec 3.13: the app reads only its own source).
import { cpSync } from 'node:fs';
cpSync('src/models/schema', 'dist/server/models/schema', {
  recursive: true,
  filter: (src) => !src.endsWith('.ts'),
});
