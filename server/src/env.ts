import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// LLMROUTER_ENV_PATH lets embedders point at an explicit .env — or at nothing:
// dotenv silently no-ops on a missing file either way.
dotenv.config({ path: process.env.LLMROUTER_ENV_PATH ?? path.resolve(__dirname, '../../.env') });
