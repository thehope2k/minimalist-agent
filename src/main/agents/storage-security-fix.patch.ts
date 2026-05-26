import { resolve, dirname } from 'node:path';

/**
 * Validates that a resolved path is within the expected parent directory.
 * Prevents path traversal attacks.
 */
function validatePathInBounds(childPath: string, parentDir: string): boolean {
  const resolvedChild = resolve(childPath);
  const resolvedParent = resolve(parentDir);
  
  // Ensure the resolved child path starts with the parent directory
  return resolvedChild.startsWith(resolvedParent + path.sep) || 
         resolvedChild === resolvedParent;
}

// Apply to deleteAgent:
export function deleteAgent(slug: string): boolean {
  const baseDir = getAgentsDir();
  const agentDir = join(baseDir, slug);
  
  // Security check: prevent path traversal
  if (!validatePathInBounds(agentDir, baseDir)) {
    console.error(`Path traversal attempt blocked: ${slug}`);
    return false;
  }
  
  if (!existsSync(agentDir)) return false;
  try {
    rmSync(agentDir, { recursive: true });
    invalidateAgentsCache();
    return true;
  } catch (err) {
    console.error(`Failed to delete agent ${slug}:`, err);
    return false;
  }
}

// Apply to loadAgentBySlug:
export function loadAgentBySlug(slug: string): LoadedAgent | null {
  const baseDir = getAgentsDir();
  const agentDir = join(baseDir, slug);
  
  // Security check: prevent path traversal
  if (!validatePathInBounds(agentDir, baseDir)) {
    console.error(`Path traversal attempt blocked: ${slug}`);
    return null;
  }
  
  return loadAgentFromDir(slug, baseDir);
}
